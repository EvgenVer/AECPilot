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
// Four capabilities are refused on purpose rather than implemented:
//   api({upload}) — multipart upload has no IPC counterpart; attachments go
//     through our own `pickAttachments` / `pasteAttachment` channels.
//   readWindowBelow() — reading which OS window sits behind us is out of scope
//     by SPEC HX12. It is IMPLEMENTED rather than left unbridged so the refusal
//     is a truthful sentence instead of the core's "unavailable on this system"
//     (task 3.25).
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

import { channelBeingEnabled } from '../aec/channels-disclosure/disclosure-pure'
import { askChannelConsent } from '../aec/channels-disclosure/store'
import { agentInstallInFlight } from '../aec/install-consent/agent-initiated'
import { installBeingRequested } from '../aec/install-consent/install-consent-pure'
import { askInstallConsent } from '../aec/install-consent/store'
import { cronContinuityEnabled } from '../aec/cron-continuity/store'
import { withContinuity } from '../aec/cron-continuity/continuity-pure'
import { cronWriteKind } from '../aec/cron-tick-notice/cron-tick-notice-pure'
import { noticeCronHasNoTick } from '../aec/cron-tick-notice/notice'

import { gatewayBridge } from './gateway-bridge'

type HermesDesktop = Window['hermesDesktop']

const REST_METHODS = ['GET', 'POST', 'PUT', 'DELETE']

/** Shown by their own error toast when someone reads the list and backs out.
 * A sentence, not a code: it is the whole feedback the person gets. */
export const CHANNEL_ENABLE_DECLINED = 'Канал не включён — вы отменили включение.'

/** То же для установки (задача 3.8): их код ловит эту ошибку и показывает её
 * текст, поэтому отказ обязан читаться как решение человека, а не как сбой. */
export const INSTALL_DECLINED = 'Не установлено — вы не подтвердили установку.'

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
              method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
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
    // Установку, начатую агентом, наш гейт не переспрашивает: человек в этот
    // момент отвечает на их карточку об этой же установке (решение владельца
    // 2026-08-21, разбор — `aec/install-consent/agent-initiated.ts`).
    const install = installBeingRequested(request)
    if (install && !agentInstallInFlight()) {
      return askInstallConsent(install).then((allowed) =>
        allowed
          ? gatewayBridge().rest<T>(request.path, {
              method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
              ...(request.body === undefined ? {} : { body: request.body }),
              ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
            })
          : Promise.reject(new Error(INSTALL_DECLINED))
      )
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

    return gatewayBridge().rest<T>(request.path, {
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      ...(body === undefined ? {} : { body }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
    })
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

  // Same decision, the other member: `gitRoot` is "which repository is this
  // path in", asked by their file tree to apply .gitignore
  // (`right-sidebar/files/ipc.ts`). Their own line is `desktop.gitRoot ?
  // desktop.gitRoot(path) : null` — so absence is a supported answer and the
  // tree simply hides nothing, while the proxy passed the check and then
  // rejected inside an `await` nobody catches.
  gitRoot: undefined,

  // Their boot flow asks for a connection descriptor, builds a ws:// URL from
  // it and hands that to the client's `connect()`. Ours ignores the URL — main
  // owns the socket — so the honest answer is a descriptor that names the IPC
  // bridge and carries NO credential. Nothing dials it: their REST goes through
  // `api` below, their plugin socket is removed, and the speech stream is
  // main's socket reached over IPC (task 3.7a).
  getConnection(profile?: null | string): Promise<unknown> {
    return Promise.resolve({
      authMode: 'token',
      baseUrl: 'ipc://main',
      profile: profile ?? null,
      token: '',
      wsUrl: 'ws://ipc/api/ws'
    })
  },

  // No pool to keep warm: one backend, owned by main, alive for as long as the
  // app is. Resolving true is the truthful answer to "is it still there".
  touchBackend(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true })
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

  // SPEC HX15: индикатор активной работы и запрет F12 — служебная механика без
  // сценария. Строка про F12 убрана и с их экрана настроек (правка [3]).
  setActiveWork: undefined,
  setDisableF12: undefined,

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

  // Task 3.25 (SPEC HX12). We do not enumerate OS windows — no `get-windows`,
  // no native module, no reading what the person has open behind us. But the
  // request still has to be ANSWERED: their handler for `window.read.request`
  // (`gateway-event.ts`) calls this and passes the result to
  // `window.read.respond`, and a request that never gets a response stalls the
  // tool for its full 30-second timeout.
  //
  // Answering `null` would already avoid the stall — the unbridged stand-in
  // rejects and their `.catch` sends an empty text. What that buys the person
  // is a LIE: on an empty text the core answers "the desktop app did not
  // answer, or window enumeration is unavailable on this system"
  // (`tools/read_window_tool.py`), so the agent relays a system limitation that
  // does not exist and may retry. An object goes through the core verbatim, so
  // this is the one place where the refusal can be truthful.
  //
  // `platform` (the other field their schema names) is deliberately absent: the
  // refusal is the same on every OS, and naming one would re-frame a product
  // decision as a platform quirk.
  readWindowBelow(): Promise<{ error: string }> {
    return Promise.resolve({
      error:
        'AECPilot не читает окна других приложений — этой возможности в продукте нет ' +
        'по решению о границах доступа, а не из-за ограничений системы. Повторный вызов ' +
        'ничего не изменит: спросите у человека, что открыто у него на экране.'
    })
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
