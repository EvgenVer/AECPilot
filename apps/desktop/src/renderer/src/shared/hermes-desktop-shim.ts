// `window.hermesDesktop` — the donor's preload bridge, reimplemented over ours.
//
// Their renderer reaches the backend through two globals: their gateway client
// (replaced by `gateway-bridge`) and this one, which carries REST, the backend
// pool and a set of native affordances. Providing it means their vendored files
// keep their own `window.hermesDesktop.…` lines instead of being edited.
//
// The TYPE is theirs — `donor/global.d.ts`, vendored — so their contract stays
// authoritative and tsc keeps using it to check their code. What is ours is the
// IMPLEMENTATION, and it is deliberately partial: everything not in
// `IMPLEMENTED` below rejects by name instead of silently doing nothing. A
// screen that needs one more member is a task that wires it (the explorer's
// file operations at 1.8.17, profiles at 1.8.11), not a reason to fake it here.
//
// Three capabilities are refused on purpose rather than implemented:
//   api({upload}) — multipart upload has no IPC counterpart; attachments go
//     through our own `pickAttachments` / `pasteAttachment` channels.
//   git / gitRoot — declared ABSENT (`undefined`), not left unbridged, so their
//     own no-bridge branches run instead of a proxy that answers "yes" to every
//     capability probe (SPEC HX6, task 3.3).
//   themes — the VS Code Marketplace import, absent for the same reason under
//     SPEC HX14 (task 3.26).
//
// And one answers without granting anything: `getConnection` hands back a
// descriptor that names the IPC bridge and carries no credential, because the
// gateway's real URL and token are exactly what SPEC C9 keeps out of the
// renderer. Callers must therefore not read that descriptor as "a socket can be
// opened to this" — `donor/lib/voice-playback.ts` did, and its speech stream
// went from "unavailable, fall back" to "throws" (task 3.7a).

import {
  channelBeingEnabled,
  isPlatformListing,
  shortlistPlatforms
} from '../aec/channels-disclosure/disclosure-pure'
import { askChannelConsent, rememberPlatformNames } from '../aec/channels-disclosure/store'
import {
  installBeingRequested,
  mcpPutRequest,
  mcpServersBeingInstalled
} from '../aec/install-consent/install-consent-pure'
import { askInstallConsent } from '../aec/install-consent/store'
import { askWebhookConsent } from '../aec/webhook-consent/store'
import { cronContinuityEnabled } from '../aec/cron-continuity/store'
import { withContinuity } from '../aec/cron-continuity/continuity-pure'
import { cronWriteKind } from '../aec/cron-tick-notice/cron-tick-notice-pure'
import { noticeCronHasNoTick } from '../aec/cron-tick-notice/notice'

import { noticePreviewLeftSandbox } from '../aec/preview-export/left-sandbox-notice'
import { localPreviewTarget } from '../donor/lib/local-preview'
import type { PreviewTarget } from '../donor/store/preview'

import { gatewayBridge } from './gateway-bridge'

type HermesDesktop = Window['hermesDesktop']

/** Наша настройка подключения в их форме (задача 3.12). Полей облака у нас нет
 * (SPEC HX3) — они отдаются пустыми, а не выдумываются: их экран читает `mode`
 * и рисует ту вкладку, которая нужна. */
function asDonorConnection(view: import('../../../shared/ipc').ConnectionView): unknown {
  return {
    ...view,
    profile: null,
    remoteOauthConnected: false,
    cloudOrg: ''
  }
}

/** Их запрос — в наш. Облако читается как локальный режим: это честнее, чем
 * принять `cloud` и подключиться неизвестно куда. */
function toOurInput(
  payload: DonorConnectionInput
): import('../../../shared/ipc').ConnectionInputView {
  const optional = [
    'remoteUrl',
    'remoteToken',
    'allowPlainTextToken',
    'sshHost',
    'sshUser',
    'sshPort',
    'sshKeyPath',
    'sshRemoteHermesPath',
    'sshRemoteProfile'
  ] as const

  const input: import('../../../shared/ipc').ConnectionInputView = {
    mode: payload.mode === 'remote' || payload.mode === 'ssh' ? payload.mode : 'local'
  }

  // Поле, которого в запросе не было, не должно появиться в нём пустым: у
  // токена пустая строка значит «не менял», и разница между «не прислал» и
  // «прислал пустое» здесь существенная.
  for (const key of optional) {
    if (payload[key] !== undefined) Object.assign(input, { [key]: payload[key] })
  }

  return input
}

interface DonorConnectionInput {
  mode?: string
  remoteUrl?: string
  remoteToken?: string
  allowPlainTextToken?: boolean
  sshHost?: string
  sshUser?: string
  sshPort?: number | null
  sshKeyPath?: string
  sshRemoteHermesPath?: string
  sshRemoteProfile?: string
}

/**
 * Живое подключение в их форме (задача 3.13b).
 *
 * ЭТО САМЫЙ ВАЖНЫЙ ОТВЕТ ШИМА. Их код спрашивает `mode` в 42 местах, и по нему
 * решает, ЧЬИ файлы показывать: этой машины или той, где работает ядро.
 * Пока мы отвечали «local» всегда, приложение при удалённом ядре показывало бы
 * ЧУЖИЕ файлы — свои собственные, местные, выглядя при этом исправным. Это
 * худший вид неправды: не отказ, а уверенный неверный ответ.
 *
 * Токена здесь по-прежнему нет (SPEC C9), и сокет по-прежнему не отсюда:
 * `wsUrl` — заглушка, которую наш мост перехватывает. Их `authMode: 'token'`
 * оставлен нарочно: при `oauth` их код полез бы обновлять билет через член,
 * которого у нас нет, и падал бы на старте.
 *
 * `connectionId` — ТОТ ЖЕ УРОК, ЧТО И `mode`, второй раз (задача 3.B1в).
 * В 0.20.5 у них появился реестр нескольких ядер, и `$activeConnectionId`
 * читает это поле. Пустое поле даёт `null` — значение стабильное, то есть
 * эффекты, у которых оно стоит в зависимостях (обновление списка сессий в
 * боковой панели, фоновая синхронизация), при смене ядра НЕ СРАБОТАЮТ. Опять
 * не отказ, а тихая неправда: переключились на серверное ядро, а список сессий
 * остался от прежнего. Подключение у нас одно за раз (SPEC O10), но
 * идентификатор обязан меняться, когда меняется цель, и переживать перезапуск —
 * поэтому он выводится из самой цели, а не выдаётся случайным.
 */
function runtimeConnection(
  view: import('../../../shared/ipc').ConnectionView | null,
  profile: null | string
): unknown {
  const base = {
    authMode: 'token' as const,
    profile,
    // SPEC C9: пусто и всегда будет пусто — токен живёт в главном процессе.
    token: '',
    // Сокет открывает main; их `connect()` у нас пустышка (см. gateway-bridge).
    wsUrl: 'ws://ipc/api/ws'
  }

  if (!view || view.mode === 'local') {
    return { ...base, baseUrl: 'ipc://main', connectionId: 'local', mode: 'local' }
  }

  if (view.mode === 'ssh') {
    // `remoteIdentity` — то, чем они различают ssh-подключения в ключах кэша.
    // Адрес туннеля для этого не годится: порт у него каждый раз новый, и кэш
    // рассыпался бы на каждое подключение.
    const identity = view.sshUser === '' ? view.sshHost : `${view.sshUser}@${view.sshHost}`
    return {
      ...base,
      baseUrl: `ssh://${identity}`,
      connectionId: `ssh:${identity}`,
      mode: 'remote',
      remoteKind: 'ssh',
      remoteHost: view.sshHost,
      remoteIdentity: identity
    }
  }

  return {
    ...base,
    baseUrl: view.remoteUrl,
    // Полный адрес, а не только имя машины: два ядра на одной машине различаются
    // портом, и по имени они слились бы в одно подключение.
    connectionId: `url:${view.remoteUrl}`,
    mode: 'remote',
    remoteKind: 'url',
    remoteHost: hostOf(view.remoteUrl)
  }
}

/** Имя машины из адреса — для строки состояния. Разбор без исключений: адрес
 * уже проверен главным процессом, но строка состояния не то место, где стоит
 * падать. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Отказ подключения в том виде, в каком его читает их экран: он ищет поле
 * `sshError` на брошенном значении и по нему выбирает объяснение — «настройте
 * вход по ключу», «ключ хоста изменился», «ядра там нет». Обычный `Error`
 * заменил бы все шесть советов одним «не получилось». */
function connectionFailure(message: string | undefined, sshError: string | undefined): Error {
  const error = new Error(message ?? 'настройка не применена')
  if (sshError !== undefined) Object.assign(error, { sshError })
  return error
}

const REST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

/** Путь без запроса и хвостовых косых — чтобы сравнивать с маршрутом. */
function restPath(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '')
}

/** Сохранение всей записи MCP через наш гейт (D-101).
 *
 * Прежняя запись читается у ядра тем же мостом: сравнивать надо с тем, что
 * ДЕЙСТВИТЕЛЬНО стоит, а не с тем, что редактор считает исходным — черновик
 * мог разойтись с ядром (каталожная установка, правка из другого окна). Если
 * прочитать не удалось, спрашивается обо всех серверах записи: лучше лишний
 * вопрос, чем запуск процесса молча. */
async function askMcpPutConsent<T>(request: {
  path: string
  body?: unknown
  timeoutMs?: number
}): Promise<T> {
  const next = (request.body as { servers?: Record<string, Record<string, unknown>> } | undefined)
    ?.servers
  let previous: Record<string, Record<string, unknown>> | undefined

  try {
    const current = await gatewayBridge().rest<{
      servers?: { name?: string; command?: string; url?: string; args?: string[] }[]
    }>('/api/mcp/servers')
    previous = Object.fromEntries(
      (current.servers ?? [])
        .filter((server) => typeof server.name === 'string')
        .map((server) => [server.name as string, serverEntryOf(server, next?.[server.name!])])
    )
  } catch {
    previous = undefined
  }

  const changed = mcpServersBeingInstalled(previous, next)
  const question = mcpPutRequest(changed)

  if (!question) {
    return gatewayBridge().rest<T>(request.path, {
      method: 'PUT',
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
    })
  }

  if (!(await askInstallConsent(question))) throw new Error(INSTALL_DECLINED)

  return gatewayBridge().rest<T>(request.path, {
    method: 'PUT',
    ...(request.body === undefined ? {} : { body: request.body }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
  })
}

/** Запись сервера, как её видит сравнение, из ответа ядра.
 *
 * Значения переменных окружения ядро отдаёт ЗАТЁРТЫМИ (`sk-p...c3sA`), поэтому
 * сравнивать их с настоящими нельзя — иначе каждое сохранение выглядело бы
 * сменой ключа. Берутся имена: сервер, которому добавили переменную, — это
 * изменение; сервер, у которого значение той же переменной поменяли в
 * редакторе, — нет. Полный разбор в `install-consent-pure.ts`. */
function serverEntryOf(
  server: { command?: string; url?: string; args?: string[]; env?: Record<string, unknown> },
  draft: Record<string, unknown> | undefined
): Record<string, unknown> {
  const draftEnv =
    draft && typeof draft.env === 'object' && draft.env !== null
      ? (draft.env as Record<string, unknown>)
      : {}
  const keys = Object.keys(server.env ?? {})

  return {
    ...(server.command === undefined ? {} : { command: server.command }),
    ...(server.url === undefined || server.url === null ? {} : { url: server.url }),
    ...(server.args === undefined ? {} : { args: server.args }),
    env: Object.fromEntries(keys.map((key) => [key, draftEnv[key] ?? null]))
  }
}

/** Shown by their own error toast when someone reads the list and backs out.
 * A sentence, not a code: it is the whole feedback the person gets. */
export const CHANNEL_ENABLE_DECLINED = 'Канал не включён — вы отменили включение.'

/** То же для установки (задача 3.8): их код ловит эту ошибку и показывает её
 * текст, поэтому отказ обязан читаться как решение человека, а не как сбой. */
export const INSTALL_DECLINED = 'Не установлено — вы не подтвердили установку.'

/** Задача 3F.D4 (D-105): отказ от включения приёмника вебхуков. Их экран ловит
 * ошибку и показывает её текст в своём уведомлении. */
export const WEBHOOKS_ENABLE_DECLINED = 'Приёмник не включён — вы отменили перезапуск ядра.'

/** The members our main process actually serves today. Typed loosely on
 * purpose: their contract is wide and precise (90-odd members), ours is a
 * hand-picked subset, and pretending the subset satisfies the whole interface
 * would need a cast per member instead of the one at the proxy below. */
const IMPLEMENTED: Record<string, unknown> = {
  api<T>(request: {
    path: string
    method?: string
    body?: unknown
    upload?: unknown
    timeoutMs?: number
  }): Promise<T> {
    if (request.upload) {
      return Promise.reject(new Error('hermesDesktop.api: uploads are not bridged'))
    }

    const method = (request.method ?? 'GET').toUpperCase()
    if (!REST_METHODS.includes(method)) {
      return Promise.reject(new Error(`hermesDesktop.api: unsupported method ${method}`))
    }

    // Task 3.10 (AC10): opening an external channel is the one call here that
    // hands data OUT of this machine, and their screen flips it on the switch.
    // The list of consequences is shown first, and a refusal is an error their
    // screen already knows how to display — it catches, notifies, and re-reads
    // the platform, so the switch goes back on its own.
    const platform = channelBeingEnabled(request)
    if (platform) {
      return askChannelConsent(platform).then((allowed) =>
        allowed
          ? gatewayBridge().rest<T>(request.path, {
              method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
              ...(request.body === undefined ? {} : { body: request.body }),
              ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
            })
          : Promise.reject(new Error(CHANNEL_ENABLE_DECLINED))
      )
    }

    // Задача 3.8 (SPEC UR23). Установка — это либо инструкции, которым агент
    // будет следовать в чужом проекте, либо процесс, который запустится на этой
    // машине. У донора это один щелчок по карточке во встроенном хабе, без
    // описания и без подтверждения. Здесь стоит наш гейт: что ставится, из
    // какого источника и какие инструменты просит — до, а не после.
    //
    // Перехват в мосте, а не в их экране, по той же причине, что и у согласия
    // на канал: правка вендорного файла умерла бы при следующем переносе, а мост
    // переживёт его и покроет любую их будущую поверхность установки.
    // Установку, начатую агентом, наш гейт не переспрашивает (решение владельца
    // 2026-08-21: человек в этот момент отвечает на их карточку об этой же
    // установке). С ядра 0.21.5 это держится само: их карточка отвечает
    // `connection.respond`, и сервер ставит ядро, а не REST через этот мост —
    // поэтому отдельный признак «установка идёт из карточки» снят (3.B6в).
    const install = installBeingRequested(request)
    if (install) {
      return askInstallConsent(install).then((allowed) =>
        allowed
          ? gatewayBridge().rest<T>(request.path, {
              method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
              ...(request.body === undefined ? {} : { body: request.body }),
              ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
            })
          : Promise.reject(new Error(INSTALL_DECLINED))
      )
    }

    // Задача 3F.D4 (D-105). Включение приёмника вебхуков перезапускает ядро,
    // и живой разговор обрывается. У донора это одна кнопка без слова о цене;
    // цена называется до нажатия, а без согласия запрос не уходит.
    if (method === 'POST' && restPath(request.path).endsWith('/api/webhooks/enable')) {
      return askWebhookConsent().then((allowed) =>
        allowed
          ? gatewayBridge().rest<T>(request.path, {
              method: 'POST',
              ...(request.body === undefined ? {} : { body: request.body }),
              ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
            })
          : Promise.reject(new Error(WEBHOOKS_ENABLE_DECLINED))
      )
    }

    // D-101 (задача 3F.8). Тот же гейт для установки РУКАМИ. Их экран MCP —
    // редактор всего `mcp.json`: «Новый сервер» правит текст, «Сохранить» шлёт
    // PUT со всей записью сразу. Поэтому POST выше ловил только те установки,
    // которые начинает агент, а человек, добавивший сервер сам, запускал
    // процесс на своей машине без единого вопроса. Спрашивается о том, что
    // появилось или изменилось, — прежняя запись берётся у ядра.
    if (method === 'PUT' && restPath(request.path) === '/api/mcp/servers') {
      return askMcpPutConsent<T>(request)
    }

    // Task 3.6 (O6). The core ticks schedules only inside its messenger
    // gateway, which we do not run — measured, not read. Until we host a tick
    // of our own, saving a job builds an expectation that never comes true, so
    // the person is told at the moment the expectation forms. The call itself
    // is not blocked: the job IS saved and "run now" works.
    const cronWrite = cronWriteKind({ method, path: request.path })
    noticeCronHasNoTick(cronWrite)

    // Task 3.5а (UR18). Continuity is a field on the job (`context_from`) that
    // their editor never writes — it is not on their screen at all. Our switch
    // is one for all jobs (owner decision), so the value is stamped here, on
    // the create their screen already makes, rather than in a form field we are
    // not allowed to add to a vendored file. An existing `context_from` is left
    // alone: a job chained to ANOTHER job is not this switch's business.
    const body =
      cronWrite === 'create' ? withContinuity(request.body, cronContinuityEnabled()) : request.body

    const answer = gatewayBridge().rest<T>(request.path, {
      method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      ...(body === undefined ? {} : { body }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
    })

    // Задача 3.11 (решение владельца 2026-08-22). Ядро знает 33 канала;
    // показываем те, за которые отвечаем. Фильтр стоит здесь, а не в их экране,
    // по той же причине, что и оба гейта выше: правка вендорного файла умерла бы
    // при следующем переносе. Уже ВКЛЮЧЁННЫЙ канал не прячется никогда — иначе
    // у человека пропал бы выключатель от того, что прямо сейчас работает.
    return isPlatformListing(request)
      ? answer.then((value) => {
          rememberPlatformNames(value)
          return shortlistPlatforms(value) as T
        })
      : answer
  },

  // Task 3.3 (SPEC HX6). There is no git in this product: no branches, no
  // worktrees, no commits — and the vault is deliberately not a repository
  // (PLAN §«Проектные скилы»). Their code MODELS that: `desktopGit()` is typed
  // `GitBridge | undefined` and every caller guards it (`if (!desktopGit()
  // ?.repoStatus) return false`, `if (!review?.prList) return`, `if (!status)
  // return null`). So the honest answer is the absent member their contract
  // already has a branch for.
  //
  // Leaving it unbridged was NOT the same thing and was actively worse: the
  // stand-in below is a callable PROXY, so `Boolean(desktopGit()?.review
  // ?.prList)` read as `true` and every capability probe answered "yes, this
  // machine has git" — the session filter grew a pull-request section
  // (`sidebar/filter-menu.tsx`), and the review pane declared the working tree
  // CLEAN (`store/review.ts` swallows the rejection into an empty file list)
  // for a vault that has no repository at all. A lie in the one direction a
  // person cannot check.
  git: undefined,

  // ЗАЯВЛЕНИЕ ОТСУТСТВИЯ, а не проброс — то же решение, что у `git`, для десяти
  // членов, которым заглушка НЕ УМЕЕТ ответить честно (находка D-41, гейт
  // `donor-members.test.ts`).
  //
  // Заглушка отдаёт вызываемый ПРОКСИ. Там, где их контракт обещает промис, это
  // честно: вызов отклоняется с именем члена. Там, где он обещает булево, строку
  // или объект-раздел, — это ложь, и ложь в ту сторону, которую человек проверить
  // не может: интерфейс возможности, которой нет.
  //
  // Замерено 2026-08-24, по одному живому месту на каждый:
  //   `Boolean(window.hermesDesktop?.terminal)` — `providers-settings.tsx:43`,
  //   решает, предлагать ли «запустить в терминале»; с прокси отвечало «да».
  //   `if (window.hermesDesktop?.dataUrlReadMax)` — `store/data-url-read-max.ts:74`.
  //   `typeof …quickEntry?.getSettings === 'function'` — `store/quick-entry.ts:69`;
  //   прокси функции проходит и такую проверку.
  //   `getPathForFile(file)` — `use-composer-actions.ts:670`: их код проверяет
  //   член на истинность и зовёт, а прокси возвращает ОБЪЕКТ там, где ждут путь
  //   строкой. Дальше он же уходит в `filePath` и в чтение файла. Это тот самый
  //   подвид, ради которого находка и заведена: не отказ, а молчаливый мусор.
  //   Перетаскивание у нас идёт БАЙТАМИ (`saveImageBuffer`/`readFileDataUrl`,
  //   задача 4D-15), а нативный путь — их запасной путь «для старых оболочек»;
  //   его честный ответ здесь — «нет».
  //
  // Отсутствие их код обрабатывает ПО ПОСТРОЕНИЮ: до всех этих членов он ходит
  // через `window.hermesDesktop?.…`, а `hermesDesktop` в их контракте
  // необязателен — значит tsc уже заставил их написать ветку на `undefined`, и
  // именно она теперь и выполняется.
  //
  // У `glassSupported`/`translucencySupported` наблюдаемое поведение не меняется
  // (их проверка `typeof … === 'boolean'` и с прокси давала false) — но давала
  // случайно, а теперь по объявлению.
  // `cloud` — их облако (SPEC HX3). Открылся задачей 3E.28, когда гвард
  // научился видеть вызовы через псевдоним: `gateway-settings.tsx` и
  // `boot-failure-overlay.tsx` спрашивают `desktop?.cloud` и по истинному
  // прокси рисуют поиск облачных подключений организации, которого у нас нет.
  // Тот же подвид, ради которого заведена находка D-41, только прятался за
  // переменной.
  cloud: undefined,
  connections: undefined,
  dataUrlReadMax: undefined,
  getPathForFile: undefined,
  glassSupported: undefined,
  quickEntry: undefined,
  settings: undefined,
  translucencySupported: undefined,
  uninstall: undefined,
  updates: undefined,

  // Same decision, the other member: `gitRoot` is "which repository is this
  // path in", asked by their file tree to apply .gitignore
  // (`right-sidebar/files/ipc.ts`). Their own line is `desktop.gitRoot ?
  // desktop.gitRoot(path) : null` — so absence is a supported answer and the
  // tree simply hides nothing, while the proxy passed the check and then
  // rejected inside an `await` nobody catches.
  gitRoot: undefined,

  // ── Приехало с пином 0.20.6 (задача 3.B2) ────────────────────────────────
  //
  // Пять членов, которые их код зовёт впервые в этой версии. Все объявлены
  // ОТСУТСТВУЮЩИМИ, а не оставлены заглушке, и у каждого своя причина — общего
  // «это не наша поверхность» мало, потому что цена вранья у них разная.
  //
  // `logsRoot` — их карточка ошибки показывает кнопку «открыть логи» по одному
  // лишь НАЛИЧИЮ члена (`window.hermesDesktop?.logsRoot && <button…>`), а сам
  // путь потом открывает через `openDir`, который у нас тоже не проброшен. На
  // заглушке кнопка появилась бы и падала. Журнал приложения у нас есть — он
  // открывается своей поверхностью (задача 3.29), а не их кнопкой.
  logsRoot: undefined,
  // `getProfileRoutes` — маршруты профилей их реестра ядер. Их же строка —
  // `if (!getProfileRoutes) return false`, то есть отсутствие для них законный
  // ответ «маршрут не зарегистрирован». Подключение у нас одно за раз (решение
  // владельца 2026-08-23), реестра маршрутов нет.
  getProfileRoutes: undefined,
  // ── Приехало с переносом их плагина специалистов (задача 3D.2) ───────────
  //
  // `mcpOauth` — слушатель обратного вызова OAuth В ГЛАВНОМ ПРОЦЕССЕ
  // (`listen` / `wait` / `cancel`). Объявлен ОТСУТСТВУЮЩИМ, и это временно, а
  // не решение: их `mcp-setup.tsx` щупает член и без него откатывается на
  // «слушатель на стороне шлюза», который работает ТОЛЬКО когда шлюз на этой же
  // машине. Их же строка: против удалённого бэкенда локальный слушатель — «the
  // only working flow», потому что 127.0.0.1 шлюза живёт на ДРУГОЙ машине и
  // браузеру отсюда недостижим.
  //
  // Удалённый режим у нас есть (UR20, задача 3.12), значит для него подключение
  // MCP-сервера с OAuth сейчас не завершается. Это исправление моего замера
  // 3.B3к, который мерил только локальное ядро, — см. задачу 3.B3к-2.
  // Заглушке достаться не может ни при каком решении: контракт обещает объект с
  // тремя функциями, а прокси отдал бы истинный объект и увёл поток в тупик
  // молча (находка D-41).
  mcpOauth: undefined,
  // `setActiveConnectionRoute` объявлен у них `=> void` — тот же D-42, что и
  // выше, и потому не может достаться заглушке ни при каком решении о
  // поверхности.
  setActiveConnectionRoute: undefined,
  // `getConnectionFor` / `getGatewayWsUrlFor` — «дай дескриптор бэкенда для
  // пары (соединение, профиль)» их РЕЕСТРА ядер. В 0.20.6 через них пошла
  // обычная работа: `store/gateway` открывает ими вторичные сокеты, `api/plugins`
  // резолвит источник, — и заглушка ломала отправку сообщения целиком
  // («getConnectionFor is not bridged», e2e задачи 3.B2).
  //
  // Отсутствие — их же предусмотренная ветка: «getConnectionFor bridge is
  // optional (older Desktop mains); without it the …», и обе площадки зовут
  // член только после проверки наличия, иначе уходя на `getConnection`.
  // Подключение у нас одно за раз (решение владельца 2026-08-23), так что
  // старый путь отвечает на тот же вопрос.
  //
  // D-133: `getConnectionFor` теперь отдан — но только для `local`, и ровно так,
  // как велит их контракт («empty/local connectionId delegates to the legacy
  // getConnection path»). Строки специалистов несут маршрут `local` (член
  // `getAgentRoster` ниже), а их маршрутизатор с таким маршрутом без этого
  // члена отказывает («cannot dial registry connections»). Чужой connectionId —
  // отказ: реестра подключений у нас нет.
  getConnectionFor(payload: {
    connectionId?: null | string
    profile?: null | string
  }): Promise<unknown> {
    const id = String(payload?.connectionId ?? '').trim()
    if (id && id !== 'local')
      return Promise.reject(new Error(`Подключение «${id}» не зарегистрировано`))
    return (IMPLEMENTED.getConnection as (profile: null | string) => Promise<unknown>)(
      payload?.profile ?? null
    )
  },
  getGatewayWsUrlFor: undefined,

  // ── Приехало с пином 0.21.2 (задача 3.B4, решения владельца 2026-09-14) ──
  //
  // `guestOnboardingEnabled`, `introReveal`, `chatOnboarding` — их первый
  // запуск: 3D-заставка и онбординг-чат (SPEC HX26, не берём). Их же главный
  // процесс отдаёт флаг истинным только за переменной окружения
  // `HERMES_GUEST_ONBOARDING=1`, то есть «выключено» — их собственное
  // состояние по умолчанию, и весь чат стоит за `isOnboardingEnabled()`.
  // Объявлены ОТСУТСТВУЮЩИМИ, а не оставлены заглушке: флаг — булево, два
  // других — разделы, и на всех трёх истинный прокси соврал бы «есть».
  guestOnboardingEnabled: undefined,
  introReveal: undefined,
  chatOnboarding: undefined,
  // `skipIntro` (0.21.3, задача 3.B5в) — флаг запуска «пропустить заставку»
  // (`HERMES_SKIP_INTRO=1`) той же поверхности: их `isIntroRevealEnabled()`
  // читает его после `isOnboardingEnabled()`, которая у нас всегда ложь.
  // Булево — объявлен отсутствующим по той же причине, что флаг выше.
  skipIntro: undefined,
  // `localModelsEnabled` — локальные модели (SPEC UR39, берём). Их главный
  // процесс включает флаг на Windows и macOS безусловно; рантайм и все данные
  // живут в ядре (`/api/local-models/*`), окну нужен только этот флаг.
  localModelsEnabled: true,
  // `resolveFavicon` — иконка САЙТА коннектора, которую их главный процесс
  // скачивает с этого сайта (`electron/favicon.ts`). Их же ветка на
  // отсутствие — монограмма вместо иконки (`components/ui/favicon.tsx`
  // проверяет наличие члена). Заглушка отдала бы истинный прокси, и каждая
  // отрисовка ждала бы отклонённый промис; главный процесс у нас в чужие
  // сайты за украшением не ходит.
  resolveFavicon: undefined,
  // Члены, приехавшие с пином 0.21.5 (задача 3.B6), чей контракт — не промис,
  // и заглушка на их форме соврала бы «есть». Их главный процесс отдаёт то,
  // чего у нашего нет:
  //   `hudModifier` — жест Ctrl+Alt для их окна-HUD: берём после сборки их
  //     нативного помощника (D-146), до тех пор ряд настроек не показывается;
  //   `windowControls` — кнопки окна под WSLg, `screenshot` — снимок окна
  //     жестом двух Command: только Linux / только macOS (SPEC HX29).
  // `minimizeToTray` и F12 как назначаемая клавиша подключены задачей 3G.23 —
  // ниже, рядом с запретом F12.
  hudModifier: undefined,
  screenshot: undefined,
  windowControls: undefined,

  // Their boot flow asks for a connection descriptor, builds a ws:// URL from
  // it and hands that to the client's `connect()`. Ours ignores the URL — main
  // owns the socket — so the honest answer is a descriptor that names the IPC
  // bridge and carries NO credential. Nothing dials it: their REST goes through
  // `api` below, their plugin socket is removed, and the speech stream is
  // main's socket reached over IPC (task 3.7a).
  getConnection(profile?: null | string): Promise<unknown> {
    const local = (): unknown => runtimeConnection(null, profile ?? null)

    // Мост может ещё не стоять (ранний вызов, тест) — это не повод отвечать
    // отказом: их пул читает ответ и без него не открывает клиента вовсе.
    if (!globalThis.window?.aecpilot) return Promise.resolve(local())

    return window.aecpilot
      .getConnection()
      .then((view) => runtimeConnection(view, profile ?? null), local)
  },

  // No pool to keep warm: one backend, owned by main, alive for as long as the
  // app is. Resolving true is the truthful answer to "is it still there".
  touchBackend(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true })
  },

  // D-133. Их плагин специалистов берёт «владельца» чата из строки списка, а
  // строка получает маршрут `{connectionId, profile}` только отсюда. Без него
  // открытие чата при активном ДРУГОМ специалисте не знало владельца (их
  // вторичный профиль идёт без connectionId) и возобновление молча не уходило.
  // Источник у нас один. Для удалённого подключения список пуст — строки
  // остаются прежними: их путь по чужому connectionId у нас не проверен.
  async getAgentRoster(): Promise<unknown> {
    const view = await window.aecpilot.getConnection()
    if (view && view.mode !== 'local') return { agents: [], sources: [] }
    const { profiles } = await window.aecpilot.listProfiles()
    const label = 'Этот компьютер'
    return {
      agents: profiles.map((row) => ({
        connectionId: 'local',
        connectionKind: 'local',
        connectionLabel: label,
        profile: row.name,
        handle: row.name
      })),
      sources: [{ connectionId: 'local', label, kind: 'local', reachable: true }]
    }
  },

  // Task 3.7a. Their recorder asks before opening capture and reads `false` as
  // "denied"; the unbridged stand-in would REJECT here, and an `await` on a
  // rejection is a throw, not a `false` — which is why pressing the microphone
  // button raised their `recordingFailed` notice instead of recording.
  requestMicrophoneAccess(): Promise<boolean> {
    return window.aecpilot.requestMicrophoneAccess()
  },

  // Task 3.19. Every "open this in a browser" in their code lands here: the
  // OAuth sign-in URL, a provider's docs link, a link clicked in the terminal
  // pane. The URL is not ours — it comes from the core or from a model's answer
  // — so it goes through main, where `decideExternalLink` allows http/https/mailto
  // and refuses everything else (`file:`, `javascript:`, …). The renderer never
  // navigates to it and never opens a window for it.
  openExternal(url: string): Promise<unknown> {
    return window.aecpilot.openExternalLink(url)
  },

  // Task 3.17. Their composer's paperclip menu adds files and folders to the
  // agent's CONTEXT (as `@file:` / `@folder:` references, not uploads) through
  // this member. Unbridged it rejected a promise nobody awaits, so "Files" and
  // "Folder" quietly did nothing — the same silent failure `openExternal` had
  // before 3.19. The dialog itself runs in main: a path the renderer did not
  // get from a human through a trusted dialog is a path it must not have.
  selectPaths(options?: {
    title?: string
    defaultPath?: string
    directories?: boolean
    multiple?: boolean
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string[]> {
    return window.aecpilot.selectPaths(options)
  },

  // Task 3.26 (SPEC HX14). Interface scale is accessibility — an engineer reads
  // drawings for hours — and it is one of the two window-appearance features
  // SPEC keeps. Main owns the level (it is per-webContents, must survive a
  // restart and must be the same in a second window), so this is a thin
  // mapping onto our IPC in their shape: `get` / `setPercent` / `onChanged`.
  //
  // Unbridged it was worse than missing: their `store/zoom.ts` checks
  // `if (window.hermesDesktop?.zoom)` — the stand-in proxy passes — and then
  // calls `zoom.get().then(…)` with no catch, so every boot raised an
  // unhandled rejection while the settings row stayed on a number that
  // nothing could change (finding D-41).
  zoom: {
    get(): Promise<{ level: number; percent: number }> {
      return window.aecpilot.getZoom()
    },
    setPercent(percent: number): void {
      void window.aecpilot.setZoomPercent(percent)
    },
    // Задача 3E.24. Их контракт объявляет этого члена необязательным, и без него
    // их же путь контекстного меню внутри гостя делил на `|| 1`, то есть не
    // делил вовсе: при масштабе ≠ 100 % меню уезжало от места нажатия.
    factor(): number {
      return window.aecpilot.zoomFactor()
    },
    onChanged(callback: (payload: { level: number; percent: number }) => void): () => void {
      return window.aecpilot.onZoomChanged(callback)
    }
  },

  // Task 3.26 (SPEC HX14). Importing a VS Code theme is a Non-Goal: it reads a
  // foreign config off the marketplace and pulls a network dependency for
  // decoration. Declared ABSENT rather than left unbridged so their own
  // `if (!api?.fetchMarketplace)` branch answers with a sentence instead of a
  // proxy call that rejects — and so the marketplace search resolves to an
  // empty list through their own `?? Promise.resolve([])`.
  themes: undefined,

  // Task 3.18. Their settings row writes the preference into their own storage
  // and calls this; main owns the real blocker and its own copy, so an
  // overnight run survives a restart of the app.
  // Задача 3.12 (SPEC UR20). К какому ядру подключено приложение.
  //
  // Их форма ответа шире нашей: там ещё облако (SPEC HX3 — исключено).
  // Недостающие поля отдаются пустыми, а не выдумываются: их экран читает
  // `mode` и рисует ту вкладку, которая нужна.
  getConnectionConfig(_profile?: null | string): Promise<unknown> {
    return window.aecpilot.getConnection().then(asDonorConnection)
  },

  saveConnectionConfig(payload: DonorConnectionInput): Promise<unknown> {
    return window.aecpilot.saveConnection(toOurInput(payload)).then((result) => {
      if (!result.ok) throw new Error(result.error ?? 'настройка не сохранена')
      return asDonorConnection(result.config)
    })
  },

  applyConnectionConfig(payload: DonorConnectionInput): Promise<unknown> {
    return window.aecpilot.applyConnection(toOurInput(payload)).then((result) => {
      if (!result.ok) throw connectionFailure(result.error, result.sshError)
      return asDonorConnection(result.config)
    })
  },

  testConnectionConfig(payload: DonorConnectionInput): Promise<unknown> {
    return window.aecpilot.testConnection(toOurInput(payload))
  },

  // Вход по OAuth — это их облако (SPEC HX3). Объявлено отсутствующим, а не
  // оставлено заглушке: их экран проверяет наличие члена и без него не рисует
  // кнопку входа вместо поля токена.
  oauthLoginConnectionConfig: undefined,
  oauthLogoutConnectionConfig: undefined,

  // Подключение через ssh (задача 3.12). Список берётся из `~/.ssh/config`
  // человека: имена, которые он уже настроил, — то, чем он и мыслит. Читается
  // только config; приватные ключи не открываются никогда и ни для чего.
  sshConfigHosts(): Promise<unknown> {
    return window.aecpilot.sshHosts()
  },

  sshResolveHost(host: string): Promise<unknown> {
    return window.aecpilot.sshResolveHost(host)
  },

  // Задача 3.7b. Слово-активатор слушает микрофон, когда на приложение никто не
  // смотрит, поэтому о работающем захвате говорит отдельное окно поверх всех.
  // Непроброшенным этот член ничего не ломал — и в этом была вся беда: захват
  // шёл, а сказать об этом было нечем.
  wakeIndicator: {
    getState(): Promise<'capturing' | 'detected' | 'hidden'> {
      return window.aecpilot.getWakeIndicator()
    },
    setState(state: 'capturing' | 'detected' | 'hidden'): void {
      window.aecpilot.setWakeIndicator(state)
    },
    onState(_callback: (state: 'capturing' | 'detected' | 'hidden') => void): () => void {
      // Состояние читает САМО окно-индикатор через свой крошечный мост; главному
      // окну слушать нечего — оно это состояние и задаёт.
      return () => {}
    }
  },

  // Задача 3.24. Плавающая лента. Их проверка возможности — `typeof
  // …hud?.open === 'function'`, и на заглушке она проходит: переключатель HUD в
  // заголовке показывался и ничего не делал (подвид D-41).
  //
  // `onCursor` проброшен, но на Windows и macOS не приходит НИКОГДА — и это их
  // замысел, а не пробел: там поток `mousemove` держит `forward: true`, а
  // подмена курсора нужна только Linux, где этой опции нет.
  hud: {
    open(request?: { sessionId?: null | string; profile?: null | string }): Promise<{
      ok: boolean
    }> {
      return window.aecpilot.openHud(request)
    },
    close(): Promise<{ ok: boolean }> {
      return window.aecpilot.closeHud()
    },
    setIgnoreMouse(ignore: boolean): void {
      window.aecpilot.setHudIgnoreMouse(ignore)
    },
    beginMove(): void {
      window.aecpilot.beginHudMove()
    },
    endMove(): void {
      window.aecpilot.endHudMove()
    },
    moveBy(size: { width: number; height: number }): void {
      window.aecpilot.moveHudBy(size)
    },
    setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
      window.aecpilot.setHudBounds(bounds)
    },
    setVibrancy(on: boolean): Promise<{ ok: boolean }> {
      return window.aecpilot.setHudVibrancy(on)
    },
    setSession(sessionId: null | string): void {
      window.aecpilot.setHudSession(sessionId)
    },
    onGoto(_callback: (sessionId: string) => void): () => void {
      // Их «перейти к разговору из ленты» ведёт в ГЛАВНОЕ окно. Пока лента
      // одна и открывается на нужной сессии сразу, отдельного перехода нет —
      // подписка честно ничего не присылает.
      return () => {}
    },
    onChanged(callback: (state: { open: boolean; sessionId: null | string }) => void): () => void {
      return window.aecpilot.onHudChanged(callback)
    },
    onCursor(_callback: (point: { x: number; y: number } | null) => void): () => void {
      return () => {}
    }
  },

  // Задача 3.14. Их проверка возможности — `typeof
  // window.hermesDesktop?.openWindow === 'function'` (`store/windows.ts`), и на
  // заглушке она проходит: та ВЫЗЫВАЕМА. То есть пункт «открыть в новом окне»
  // показывался и раньше — он просто ничего не делал (подвид D-41).
  openWindow(): Promise<{ ok: boolean; error?: string }> {
    return window.aecpilot.openAppWindow()
  },

  openSessionWindow(
    sessionId: string,
    options?: { watch?: boolean }
  ): Promise<{ ok: boolean; error?: string }> {
    return window.aecpilot.openSessionWindow(sessionId, options?.watch === true)
  },

  // Задача 3E.5 (UR31). Вынос вкладки браузера в своё окно. Их проверка
  // возможности — снова `typeof … === 'function'` (`store/windows.ts`), то
  // есть до этой строки кнопка «вынести» показывалась и молчала: тот же
  // подвид D-41, что у `openWindow`.
  openBrowserWindow(tabId: string): Promise<{ ok: boolean; error?: string }> {
    return window.aecpilot.openBrowserWindow(tabId)
  },

  // Задача 3E.5 (UR31, риск R13). Их же helper (`lib/preview-reach.ts`) зовёт
  // это ТОЛЬКО при удалённом шлюзе и переживает отсутствие члена — но
  // пережить и означало бы «показать пустую панель молча».
  reachPreviewUrl(url: string): Promise<string> {
    return window.aecpilot.reachPreviewUrl(url)
  },

  // Задача 3E.8 (UR30, отменённый HX12). Окно ОС под нашим. Их ветка на
  // отсутствие члена уже написана (`desktop-bridge.ts` отвечает пустым
  // текстом), но пустой ответ инструмента ядро ждёт все свои 30 секунд —
  // «агент завис» дороже отказа. Отвечаем всегда, в том числе отказом со
  // словами.
  readWindowBelow(): Promise<unknown> {
    return window.aecpilot.readWindowBelow()
  },

  // Задача 3E.8 (UR30, отменённый HX7). Раздел был ОБЪЯВЛЕН ОТСУТСТВУЮЩИМ:
  // их `providers-settings.tsx` проверяет его как `Boolean(...terminal)`, и
  // заглушка-прокси отвечала бы «есть» про то, чего нет. Теперь есть.
  terminal: {
    start: (options?: { cols?: number; cwd?: string; rows?: number }) =>
      window.aecpilot.terminal.start(options),
    write: (id: string, data: string) => window.aecpilot.terminal.write(id, data),
    resize: (id: string, size: { cols: number; rows: number }) =>
      window.aecpilot.terminal.resize(id, size),
    dispose: (id: string) => window.aecpilot.terminal.dispose(id),
    cwd: (id: string) => window.aecpilot.terminal.cwd(id),
    onData: (id: string, callback: (chunk: string) => void) =>
      window.aecpilot.terminal.onData(id, callback),
    onExit: (
      id: string,
      callback: (event: { code: number | null; signal: string | null }) => void
    ) => window.aecpilot.terminal.onExit(id, callback)
  },

  // Задача 3E.26 (SPEC UR22, замечание D-75). Их кнопка «открыть в браузере».
  // До неё их панель отвечала отказом: `lib/local-preview.ts` зовёт
  // `bridge.openPreviewInBrowser`, а моста не было — и гвард непроброшенных
  // членов этого не видел, потому что вызов идёт через псевдоним (замечание
  // D-76, задача 3E.28).
  //
  // ОТКАЗ ПОДНИМАЕТСЯ ОШИБКОЙ: их код ловит её и показывает человеку текст
  // (`notifyError`). Молчаливый `undefined` означал бы «открыл», хотя не открыл.
  async openPreviewInBrowser(url: string): Promise<void> {
    const answer = await window.aecpilot.openPreviewInBrowser(url)

    if (!answer.ok) throw new Error(answer.error)
    // Содержимое вкладки выгружено файлом и открыто снаружи — это ослабление
    // обещания UR22, и человек узнаёт о нём в ту же секунду.
    if (answer.exported) noticePreviewLeftSandbox()
  },

  // Задача 3E.25 (SPEC UR22, замечание D-75). Живая перезагрузка предпросмотра:
  // их панель умеет её сама и ждёт ровно этих членов. Без них она молча не
  // следила (`preview-pane.tsx` проверяет наличие члена), то есть агент правил
  // файл, а человек смотрел на прошлую версию.
  //
  // ОТКАЗ ПОДНИМАЕТСЯ ОШИБКОЙ, а не пустым наблюдателем: их эффект ловит её и
  // печатает причину в консоль панели. Наблюдатель, который никогда ничего не
  // пришлёт, выглядел бы работающим.
  async watchPreviewFile(url: string): Promise<{ id: string; path: string }> {
    const answer = await window.aecpilot.watchPreviewFile(url)

    if (!answer.ok) throw new Error(answer.error)

    return answer.watch
  },

  // Задача 3E.31 (замечание D-79, решение владельца 2026-09-09). Их редактор
  // предпросмотра сохраняет правку этим членом, и до сих пор он был
  // непроброшен: их собственная честная ветка «Saving is not available»
  // (`lib/desktop-fs.ts`) до человека не доходила, потому что заглушка-прокси
  // истинна на вид, — вместо неё панель показывала внутреннюю ошибку с именем
  // члена. Взят ОДИН член из трёх: `renamePath` и `trashPath` мост по-прежнему
  // не отдаёт, и решение по ним записано в `donor-members.test.ts`.
  //
  // ОТКАЗ ПОДНИМАЕТСЯ ОШИБКОЙ: их `handleSave` ловит её и печатает текст под
  // кнопкой (`setSaveError`). Тихий успех означал бы «сохранено», хотя нет.
  async writeTextFile(filePath: string, content: string): Promise<{ path: string }> {
    const answer = await window.aecpilot.writePreviewText(filePath, content)

    if (!answer.ok) throw new Error(answer.error)

    return { path: answer.path }
  },

  // Дефект D-127. Их просмотр файла (`preview-file.tsx`) читает текст этим
  // членом; непроброшенный, он превращал любой текстовый файл в «Предпросмотр
  // недоступен». Отдан по правилу слежения — файл проекта либо выбранный
  // человеком; их загрузчик плагинов (SPEC HX5) по-прежнему получает отказ.
  async readFileText(filePath: string): Promise<{
    binary: boolean
    byteSize: number
    path: string
    text: string
    truncated: boolean
  }> {
    const answer = await window.aecpilot.readPreviewText(filePath)

    if (!answer.ok) throw new Error(answer.error)

    return {
      binary: answer.binary,
      byteSize: answer.byteSize,
      path: answer.path,
      text: answer.text,
      truncated: answer.truncated
    }
  },

  // Задача 3.B4 (SPEC UR4, пакет 9.7 донора). Их аннотации на предпросмотре:
  // человек обводит место на странице, панель снимает гостя и кладёт вырез в
  // композер. Приехало с 0.21.2 и взято решением владельца 2026-09-14.
  //
  // ОТКАЗ ПОДНИМАЕТСЯ ОШИБКОЙ: их `capture` ждёт data-URL и сам бросает
  // «preview capture is unavailable» на пустой ответ — заглушка-прокси
  // отдала бы отклонённый промис с именем члена вместо причины.
  async capturePreview(payload: {
    rect?: { height: number; width: number; x: number; y: number }
    viewport?: { height: number; width: number }
    webContentsId: number
  }): Promise<string> {
    const answer = await window.aecpilot.capturePreview(payload)

    if (!answer.ok) throw new Error(answer.error)

    return answer.dataUrl
  },

  stopPreviewFileWatch(id: string): Promise<boolean> {
    return window.aecpilot.stopPreviewWatch(id)
  },

  onPreviewFileChanged(
    callback: (payload: { id: string; path: string; url: string }) => void
  ): () => void {
    return window.aecpilot.onPreviewFileChanged(callback)
  },

  // Задача 3E.25. Работа поделена по знанию: ПУТЬ приводит главный процесс
  // (правила путей знает node — их запасной разбор на Windows приклеивает
  // рабочую папку к абсолютному `D:\файл`), а КЛАССИФИКАЦИЮ делает их же
  // таблица расширений. Вторая такая таблица у нас разошлась бы с первой при
  // первом же переносе донора.
  async normalizePreviewTarget(target: string, baseDir?: string): Promise<null | PreviewTarget> {
    const raw = target.trim().replace(/^`|`$/g, '')

    if (raw === '') return null
    // Адрес — не файл: у их разбора для него своя ветка, и главному процессу там
    // делать нечего.
    if (/^https?:\/\//i.test(raw)) return localPreviewTarget(raw)

    const resolved = await window.aecpilot.resolvePreviewTarget(raw, baseDir)

    if (!resolved.ok) return null

    const classified = localPreviewTarget(resolved.absPath)

    // `source` — то, что назвал человек или агент: их панель показывает его как
    // подпись, и подменять его абсолютным путём значило бы потерять написанное.
    return classified ? { ...classified, source: raw } : null
  },

  onBrowserPopoutClosed(callback: (tabId: string) => void): () => void {
    return window.aecpilot.onBrowserPopoutClosed(callback)
  },

  // Задача 3E.5 (UR31). Жест, не дошедший до страницы сам. Подписка обязана
  // вернуть ФУНКЦИЮ ОТПИСКИ: их эффект кладёт ответ прямо в `return`, и
  // промис на этом месте — находка D-42, уронившая дерево.
  onPreviewNav(callback: (command: 'back' | 'forward' | 'reload') => void): () => void {
    return window.aecpilot.onPreviewNav(callback)
  },

  // Задача 3.14. Пока окно было одно, вопроса не было. Теперь их может быть
  // несколько, и каждое получает те же события ядра — без этого члена звук
  // конца хода и чтение вслух срабатывали бы в КАЖДОМ окне (их же
  // `ownsAmbientCue` на непроброшенном члене отвечает «занимай», чтобы не
  // замолчать совсем).
  claimAmbientCue(key: string): Promise<boolean> {
    return window.aecpilot.claimAmbientCue(key)
  },

  // Задача 3.14, SPEC HX7. Запуск их текстового интерфейса в СТОРОННЕМ
  // терминале — не наша поверхность: интерфейс здесь мы. Объявлено
  // отсутствующим, а не оставлено заглушке, потому что их проверка возможности
  // — `typeof … === 'function'`, и на заглушке она проходит: пункт «открыть в
  // терминале» показывался бы и не работал.
  openSessionInTerminal: undefined,

  setKeepAwake(on: boolean): void {
    void window.aecpilot.setKeepAwake(on)
  },

  // ЧЛЕН, ОБЪЯВЛЕННЫЙ `=> void`, ОБЯЗАН ВОЗВРАЩАТЬ `void`.
  //
  // Восемь членов их моста объявлены `=> void`, и их код зовёт такой член в том
  // числе ТЕЛОМ эффекта: `useEffect(() => syncNativeTheme(mode, rendered), […])`.
  // Что вернёт член, то React запомнит как «функцию уборки» этого эффекта. У
  // непроброшенного члена заглушка возвращает ОТКЛОНЁННЫЙ ПРОМИС — и на втором
  // срабатывании эффекта React зовёт промис как функцию.
  //
  // Так и умирало приложение (находка D-42, разобрана 2026-08-21): тема ОС
  // менялась на тёмную — эффект срабатывал первый раз, промис оседал уборкой;
  // тема возвращалась в светлую — второе срабатывание, `destroy_ is not a
  // function`, всё дерево заменялось их аварийным экраном. Снаружи это
  // выглядело как «в тёмную уходит, обратно не возвращается».
  //
  // Поэтому ниже нет ни одного `=> void`-члена, оставленного заглушке: те, что
  // нужны, реализованы и возвращают `void`; те, что исключены объёмом,
  // объявлены ОТСУТСТВУЮЩИМИ — и тогда их же `?.` не доходит до вызова.
  // Проверяется тестом `void-members.test.tsx`.

  // Задача 3.26. Тема красит не только страницу: рамка окна, подложка до первой
  // отрисовки и материал окна на macOS живут в главном процессе. Это не
  // «отдельная тема тайтлбара» из HX14, а та же тема, доведённая до рамки.
  setNativeTheme(mode: 'dark' | 'light' | 'system'): void {
    window.aecpilot.setNativeTheme(mode)
  },

  // SPEC HX14: прозрачность окна и отдельная тема тайтлбара — Non-Goals. Плюс
  // окно у нас с обычной рамкой ОС, так что их `setTitleBarOverlay` не на что
  // накладывать.
  setTitleBarTheme: undefined,
  setTranslucency: undefined,

  // SPEC UR37 (задача 3E.10). Правый клик и орфография. Меню рисует их же
  // рендерер — здесь только то, чего окно не может само.
  contextMenuEdit(command: 'copy' | 'cut' | 'paste' | 'selectAll'): Promise<void> {
    return window.aecpilot.contextMenuEdit(command)
  },
  contextMenuCopyImage(): Promise<void> {
    return window.aecpilot.contextMenuCopyImage()
  },
  contextMenuSpellcheck(action: { kind: 'add' | 'replace'; word: string }): Promise<void> {
    return window.aecpilot.contextMenuSpellcheck(action)
  },
  contextMenuGuestAddWord(payload: { webContentsId: number; word: string }): Promise<void> {
    return window.aecpilot.contextMenuGuestAddWord(payload)
  },
  onContextMenuSpellcheck(
    cb: (facts: { misspelledWord: string; suggestions: string[] }) => void
  ): () => void {
    return window.aecpilot.onContextMenuSpellcheck(cb)
  },

  // SPEC UR35 (задача 3E.11). Раньше здесь стояло `undefined` по HX15 —
  // исключение отменено владельцем 05.09.2026, и оба члена проброшены.
  // Односторонние: сводка о ходе шлётся на каждую смену состава, переключатель
  // F12 — на каждое нажатие, и ответ ни тому, ни другому не нужен.
  setActiveWork(payload: { count: number; titles: string[] }): void {
    window.aecpilot.setActiveWork(payload)
  },
  setDisableF12(blocked: boolean): void {
    window.aecpilot.setDisableF12(blocked)
  },
  // Задача 3G.23 (D-146): F12 как назначаемая клавиша и трей — те же каналы,
  // что у их главного процесса. `setF12ShortcutActive` односторонний: промис
  // здесь стал бы «функцией уборки» их эффекта (D-42).
  setF12ShortcutActive(active: boolean): void {
    window.aecpilot.setF12ShortcutActive(active)
  },
  onF12Shortcut(
    cb: Parameters<Window['aecpilot']['onF12Shortcut']>[0]
  ): () => void {
    return window.aecpilot.onF12Shortcut(cb)
  },
  minimizeToTray: {
    get: () => window.aecpilot.minimizeToTray.get(),
    set: (on: boolean) => window.aecpilot.minimizeToTray.set(on),
    onChanged: (cb: Parameters<Window['aecpilot']['minimizeToTray']['onChanged']>[0]) =>
      window.aecpilot.minimizeToTray.onChanged(cb)
  },

  // SPEC UR35 + C12. Версия НАША: их экран «о программе» показывает то, что
  // ответит этот член, и донорское имя с донорским номером были бы там прямой
  // неправдой о том, что человек запустил.
  getVersion() {
    return window.aecpilot.getVersion()
  },

  // macOS: перехват ⌘W ради выбора «вкладка или окно». На нашей платформе
  // решать нечего, и обещать перехват мы не будем.
  setPreviewShortcutActive: undefined,

  // Задача 3.8 (SPEC UR23, третий вход). Установка по внешней ссылке — канал, в
  // котором инициатор не человек и не агент, а содержимое, пришедшее снаружи.
  // У НАС ЭТОГО КАНАЛА НЕТ: приложение не регистрирует ни одной схемы в
  // операционной системе (`app.setAsDefaultProtocolClient` не вызывается — это
  // проверяется тестом `main/no-protocol-client.test.ts`), поэтому ссылке
  // неоткуда прийти.
  //
  // Объявлено ОТСУТСТВУЮЩИМ, а не оставлено заглушке, по двум причинам. Первая
  // — правда: их код спрашивает `?.`, и отсутствие члена читается как «канала
  // нет», тогда как заглушка притворяется подписчиком, который просто молчит.
  // Вторая — `signalDeepLinkReady` возвращает промис, и `void …?.()` на
  // заглушке давал НЕОБРАБОТАННОЕ ОТКЛОНЕНИЕ на каждом старте (тот же подвид
  // D-41, что у батареи).
  onDeepLink: undefined,
  signalDeepLinkReady: undefined,

  // Задача 3.29. Журнал приложения. `reportRendererError` зовёт их аварийный
  // экран в `componentDidCatch`: без него причина падения жила ровно столько,
  // сколько окно, и после перезапуска рассказать о случившемся было нечем.
  // Возвращает `void` — см. правило выше.
  reportRendererError(report: {
    label?: string
    boundary?: string
    message?: string
    componentStack?: string
  }): void {
    window.aecpilot.reportRendererError(report)
  },

  revealLogs(): Promise<{ ok: boolean; path: string; error?: string }> {
    return window.aecpilot.revealLogs()
  },

  getRecentLogs(): Promise<{ path: string; lines: string[] }> {
    return window.aecpilot.getRecentLogs()
  },

  // Задача 3.28 — работа, пока на приложение никто не смотрит.
  //
  // `notify` — единственный способ сказать «готово» человеку, который отошёл от
  // машины; КОГДА показывать, решает их собственное хранилище уведомлений, а
  // это только показ. Два подписчика рядом с ним — маршрут щелчка: по телу
  // уведомления их код открывает нужную сессию, по кнопке (macOS) отвечает на
  // запрос подтверждения.
  //
  // `getOnBattery` был непроброшен, и это не «кнопка молчит», а необработанное
  // отклонение промиса на КАЖДОМ старте: их `store/power.ts` зовёт его без
  // `catch` (тот же подвид D-41, что был у зума). Заодно возвращается смысл:
  // на батарее их страховочные опросы растягиваются вчетверо.
  //
  // `onPowerResume` возвращает приложение к жизни после сна машины. Их половина
  // — пересобрать своё состояние; наша, более важная в этой сборке, — в главном
  // процессе: сокет к шлюзу мог остаться открытым и мёртвым, и это проверяется
  // вопросом, а не верой (`revalidateGatewayAfterResume`).

  notify(payload: {
    title?: string
    body?: string
    silent?: boolean
    kind?: string
    sessionId?: string
    tag?: string
    actions?: { id: string; text: string }[]
  }): Promise<boolean> {
    return window.aecpilot.showNotification(payload)
  },

  onFocusSession(callback: (sessionId: string) => void): () => void {
    return window.aecpilot.onNotificationFocusSession(callback)
  },

  onNotificationAction(
    callback: (payload: { actionId: string; sessionId?: string }) => void
  ): () => void {
    return window.aecpilot.onNotificationAction(callback)
  },

  // Задача 3D.9. Уведомление их плагина сессии не имеет: щёлкнув по нему,
  // человек должен попасть в чат бота, а не в «никуда». Приёмник давно лежал
  // в зоне и работал — не было только этого канала.
  onNotificationActivate(
    callback: (payload: {
      actionId?: string
      activate?: string
      notifyId?: string
      tag?: string
    }) => void
  ): () => void {
    return window.aecpilot.onNotificationActivate(callback)
  },

  getOnBattery(): Promise<boolean> {
    return window.aecpilot.getOnBattery()
  },

  onBatteryChanged(callback: (onBattery: boolean) => void): () => void {
    return window.aecpilot.onBatteryChanged(callback)
  },

  onPowerResume(callback: () => void): () => void {
    return window.aecpilot.onPowerResume(callback)
  },

  // Task 4D-15. Their composer's drop engine calls these two; without them a
  // dropped image hit the unbridged-member path and the attachment silently
  // was not one. `readFileDataUrl` answers only for files `saveImageBuffer`
  // just wrote — see main/attachments.ts for why it is not a general reader.
  async saveImageBuffer(bytes: Uint8Array, extension: string): Promise<null | string> {
    const result = await window.aecpilot.saveAttachmentImage(bytes, extension)
    return result.ok ? result.path : null
  },

  async readFileDataUrl(filePath: string): Promise<string> {
    const result = await window.aecpilot.readAttachmentDataUrl(filePath)
    if (!result.ok) throw new Error(result.error)
    return result.dataUrl
  },

  // Задача 3.27 — четыре члена «наружу». Три из них разбирал бы один и тот же
  // вопрос: что делать с отказом. Их код различает три исхода, и шим обязан
  // отвечать в их форме, иначе кнопка врёт:
  //   получилось  → значение (`true` / путь) — их код показывает уведомление;
  //   отменили    → `false` / `''` / `{saved:false}` — про закрытый диалог
  //                 человеку не сообщают, и молчание здесь правильное;
  //   отказ/сбой  → ИСКЛЮЧЕНИЕ, потому что их `notifyError(error, …)` берёт
  //                 текст из `error.message`. Вернуть здесь `false` значило бы
  //                 показать отказ как отмену — то есть промолчать о том, что
  //                 файл не сохранён.
  //
  // Без этих четырёх кнопка «сохранить» у картинки была сломана в третью
  // сторону (находка D-41): заглушка-прокси ПРАВДИВА на вид, их проверка
  // `if (window.hermesDesktop?.saveImageFromUrl)` проходила, вызов отклонялся,
  // и человек получал «не удалось скачать картинку» вместо диалога.

  selectSavePath(options?: {
    defaultPath?: string
    filters?: Array<{ extensions: string[]; name: string }>
    title?: string
  }): Promise<null | string> {
    return window.aecpilot.selectSavePath(options)
  },

  async saveImageFromUrl(url: string): Promise<boolean> {
    const result = await window.aecpilot.saveImageOut(url)
    if (result.error !== undefined) throw new Error(result.error)
    return result.saved
  },

  async saveClipboardImage(): Promise<string> {
    const result = await window.aecpilot.saveClipboardImage()
    if (!result.ok) throw new Error(result.error)
    return result.path
  },

  // Ядро 0.21.3 (задача 3.B5в): очень большая вставка текста становится
  // `.txt`-вложением — та же форма ответа, что у картинки из буфера выше:
  // путь при удаче, исключение при отказе (их `notifyError` берёт текст из
  // `error.message`, а на `''` они оставляют вставку в поле).
  async savePastedText(text: string): Promise<string> {
    const result = await window.aecpilot.savePastedText(text)
    if (!result.ok) throw new Error(result.error)
    return result.path
  },

  async saveGatewayFile(payload: {
    path: string
    profile?: null | string
    suggestedName?: string
  }): Promise<{ canceled?: boolean; path?: string; saved: boolean }> {
    const result = await window.aecpilot.saveFileOut({
      path: payload.path,
      ...(payload.suggestedName === undefined ? {} : { suggestedName: payload.suggestedName })
    })
    if (result.error !== undefined) throw new Error(result.error)
    return {
      saved: result.saved,
      ...(result.canceled === undefined ? {} : { canceled: result.canceled }),
      ...(result.path === undefined ? {} : { path: result.path })
    }
  },

  profile: {
    set(name: string) {
      return window.aecpilot.useProfile(name)
    }
  }
}

/** Everything else answers with its own name, so an unwired capability shows up
 * as one readable failure instead of `undefined is not a function`.
 *
 * Their bridge has three member shapes, and the stand-in has to answer in kind
 * or their code breaks on the SHAPE rather than on the missing capability —
 * both of the first boot's crashes were exactly that:
 *   method        `getVersion()`         → a rejected promise, named
 *   subscription  `onFoundInPage(cb)`    → a DISPOSER; a promise here tore the
 *                                          app down with "detachListener is
 *                                          not a function"
 *   namespace     `zoom.get()`,          → an object whose members are again
 *                 `zoom.onChanged(cb)`     one of these three
 * So the stand-in is a callable proxy that reproduces itself on property
 * access, with `then` deliberately absent — an accidental thenable would make
 * every `await` on it hang. */
const SUBSCRIPTION = /^on[A-Z]/

function unbridged(path: string): unknown {
  const member = path.slice(path.lastIndexOf('.') + 1)

  const call = SUBSCRIPTION.test(member)
    ? () => () => {}
    : () => Promise.reject(new Error(`window.hermesDesktop.${path} is not bridged in AECPilot`))

  return new Proxy(call, {
    get(_target, property) {
      // Never look like a promise, an iterable or a primitive.
      if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
        return undefined
      }
      return unbridged(`${path}.${String(property)}`)
    }
  })
}

export function createHermesDesktopBridge(): HermesDesktop {
  const proxy = new Proxy(IMPLEMENTED, {
    get(target, property: string) {
      if (property in target) return target[property]
      return unbridged(property)
    },
    has() {
      return true
    }
  })

  return proxy as unknown as HermesDesktop
}

/** Installs the bridge on `window`. Called once, before React mounts. */
export function installHermesDesktopBridge(): void {
  window.hermesDesktop = createHermesDesktopBridge()
}
