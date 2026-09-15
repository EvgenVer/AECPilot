// Перенос экрана донора не заканчивается сборкой (находка D-41).
//
// Экран может собираться и молча не работать, если зовёт член
// `window.hermesDesktop`, которого наш мост не отдаёт. Так было у `openExternal`
// (кнопка «войти», 3.19), у `selectPaths` («Файлы»/«Папка» в скрепке, 3.17), у
// `setNativeTheme` — там непроброшенный член приложение УБИЛ (D-42).
//
// ЧТО ЗАГЛУШКА УМЕЕТ И ЧЕГО НЕ УМЕЕТ. Непроброшенный член становится вызываемым
// прокси. Где их контракт обещает `Promise`, это честно: вызов отклоняется с
// именем члена. Где обещает булево, строку или объект-раздел — прокси истинен,
// и проверка возможности отвечает «есть» про то, чего нет. Где обещает `=> void`
// — промис оседает «функцией уборки» эффекта и роняет дерево; этот случай
// закрывает `void-members.test.ts`, первая половина решения.
//
// ЭТОТ ФАЙЛ — вторая половина, общий случай: список ЗОВОМЫХ членов против
// РЕАЛИЗОВАННЫХ, сделанный частью гейта. Два правила:
//
//   1. Снимок. Множество «зовут, но не отдаём» обязано совпасть с `UNBRIDGED`.
//      Новое имя означает, что перенесли экран и не решили про его члены.
//   2. Честный отказ. Член из этого множества, чей контракт НЕ обещает промис и
//      не является подпиской, обязан быть объявлен ОТСУТСТВУЮЩИМ в шиме —
//      заглушка на его форме соврала бы.
//
// Читаются три файла исходниками, а не импортами: их контракт и их дерево — чтобы
// проверка пережила перенос донора; наш шим — потому что он тянет за собой
// половину рендерера и в узловом тесте не поднимается.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const DONOR_DIR = join(__dirname, '..', 'donor')
const CONTRACT = join(DONOR_DIR, 'global.d.ts')
const SHIM = join(__dirname, 'hermes-desktop-shim.ts')

/** Члены, которые код донора зовёт, а наш мост не отдаёт.
 *
 * Имена без пояснений НАРОЧНО: пояснение пришлось бы выдумывать, а кто именно
 * зовёт каждый член — тест считает сам и печатает при расхождении. Все они
 * принадлежат поверхностям вне уже сделанных фаз; классификацию поверхностей
 * держит реестр паритета (AC9), у которого единица — экран. */
const UNBRIDGED = [
  // ── Открылись задачей 3E.28, когда детектор научился видеть псевдоним.
  // Пятнадцать имён, сгруппированы по ПОВЕРХНОСТИ: решение у поверхности одно
  // на всю группу.
  //
  // (1) Загрузчик ИХ десктопных плагинов (`contrib/runtime-loader.ts`) —
  // SPEC HX5, не берём. `readFileText` здесь особый случай: при подъёме на
  // 0.21.0 его убрали из списка, потому что прямой вызов у донора исчез, и
  // тогда же записали, что член всё ещё зовут через переменную и детектор
  // этого не видит. Теперь видит — запись вернулась строкой.
  // `agentPluginsRoot` снят с пином 0.21.2 (3.B4): их загрузчик больше его
  // не зовёт — второй корень сканирования (плагины ядра) ушёл, десктопные
  // половины пакетов теперь материализует их главный процесс в единственный
  // корень `desktopPluginsRoot` (маркер `.hermes-package.json`).
  'readDir',
  'readFileText',
  'readPluginSource',
  'watchDirectory',
  // (2) Их установщик ядра (`desktop-install-overlay.tsx`) — ядро ставим мы
  // сами (фаза 1.7), их мастер не берём; рядом уже лежат `cancelBootstrap`,
  // `repairBootstrap`, `resetBootstrap`.
  'continueBootstrapLocal',
  'onBootstrapEvent',
  // (3) Их жизненный цикл бэкенда (`use-gateway-boot.ts`). Возможность у нас
  // ЕСТЬ, но другой дорогой: реестр паритета сводит их
  // `backend`/`backend-exit`/`boot-progress`/`bootstrap` к нашим
  // `gateway`/`setup`. Проброс дал бы вторую машинерию поверх первой.
  'getBootProgress',
  'onBackendExit',
  'onBootProgress',
  'onConnectionApplied',
  'revalidateConnection',
  // (4) УДАЛЕНИЕ И ПЕРЕИМЕНОВАНИЕ ФАЙЛОВ их деревом (`lib/desktop-fs.ts`).
  // Решение владельца 2026-09-09 по замечанию D-79: из трёх членов группы
  // проброшен ТОЛЬКО `writeTextFile` — у него есть живая цена на поверхности,
  // которую мы взяли (сохранение правки в их панели предпросмотра), и его
  // можно отдать по той же дисциплине, что запись файлов вообще: главный
  // процесс пишет лишь туда, что сам человеку показал (задача 3E.31,
  // `preview-write-pure.ts`). Эти двое остаются непроброшенными намеренно:
  // за ними стоит их дерево файлов, поверхность отдельная, и удаление —
  // возможность, которую не выдают заодно с сохранением.
  'renamePath',
  'trashPath',
  // ── Найдены раньше, прямым обращением.
  'cancelBootstrap',
  'desktopPluginsRoot',
  'fetchLinkTitle',
  'getAgentRoster',
  'getRemoteDisplayReason',
  'installDesktopPlugin',
  'onClosePreviewRequested',
  'onFoundInPage',
  'onOpenFindBarRequested',
  'onOpenFolderRequested',
  'onOpenUpdatesRequested',
  'onWindowStateChanged',
  // Четыре члена живой перезагрузки предпросмотра — `normalizePreviewTarget`,
  // `watchPreviewFile`, `stopPreviewFileWatch`, `onPreviewFileChanged` — сняты
  // отсюда задачей 3E.25: мост их отдаёт (решение владельца 2026-09-08 по
  // замечанию D-75).
  'openDir',
  'probeConnectionConfig',
  'probePluginRepo',
  'readClipboard',
  'readFileDataUrlForAttach',
  // `readFileText` вернулся в список выше: предупреждение, оставленное здесь
  // при подъёме на 0.21.0 («член всё ещё зовут через переменную, детектор не
  // видит»), задача 3E.28 сделала лишним — теперь видит.
  'repairBootstrap',
  'resetBootstrap',
  'revealPath',
  'sanitizeWorkspaceCwd',
  'setSecretStorageEncryption',
  'writeClipboard',
  // ── Приехало с пином 0.21.2 (задача 3.B4). У всех контракт — промис, то есть
  // заглушка отказывает честно; булевы и разделы той же версии объявлены
  // отсутствующими в шиме (`guestOnboardingEnabled`, `introReveal`,
  // `chatOnboarding`, `resolveFavicon`), а `localModelsEnabled` и
  // `capturePreview` проброшены.
  //
  // (5) Факты о машине для их онбординг-чата (`store/machine.ts`, SPEC HX26)
  // и подсказка языка ОС при незаданном `display.language` — у нас язык
  // интерфейса хранится своим клиентом (`shared/i18n/config-client.ts`) и
  // задан всегда, так что до этой ветки их `i18n/context.tsx` не доходит.
  'getMachineProfile',
  // (6) Пределы ПУЛА бэкендов (`store/pool-limits.ts`, их пакет 9.7). Пула у
  // нас нет: один `hermes serve` на все профили (замечание D-14, задача
  // 4D-29), так что применять предел не к чему. Решение владельца 2026-09-15
  // (замечание D-84, SPEC HX27): сам ряд снят из `config-settings.tsx` правкой
  // [3]; стор и ряд лежат в зоне мёртвыми, члены остаются отказом.
  'getPoolLimits',
  'setPoolLimits',
  // (7) Сверка ИХ десктопных плагинов после установки (`plugins-tab.tsx`,
  // `plugin-install-modal.tsx`) — загрузчик их плагинов SPEC HX5, не берём;
  // рядом уже лежит `installDesktopPlugin`.
  'reconcileDesktopPlugins',
  // (8) Их обновлятор (SPEC HX4): `relaunchApp` — перезапуск после подмены
  // бандла, `recycleBackend` — перезапуск бэкенда после того, как `hermes
  // update` сменил код под работающим процессом (ядро отвечает «Restart
  // required»). Ядро у нас двигается только пином, и подъём перезапускает
  // всё приложение; их кнопка на отказ показывает «restart failed».
  'recycleBackend',
  'relaunchApp'
].sort()

/** Исходник без комментариев.
 *
 * Задача 3E.28: рассказ о члене — не вызов. У донора в `sdk/index.ts` лежит
 * фраза «into desktop.log via the renderer-console tap», и детектор псевдонимов
 * записал бы `log` в зовомые члены по одному упоминанию в пояснении. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Каждый `.ts`/`.tsx` зоны донора, вместе с путём. */
function donorFiles(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...donorFiles(full))
    else if (/\.tsx?$/.test(entry.name))
      out.push({ path: full, source: code(readFileSync(full, 'utf-8')) })
  }

  return out
}

/** Псевдонимы моста в одном файле: `const desktop = window.hermesDesktop`.
 *
 * Задача 3E.28 (замечание D-76, оно же слепое пятно D-63). Детектор искал
 * буквальное `hermesDesktop.имя` и не видел ничего, что зовут через переменную,
 * — а таких присваиваний в зоне 93. Из-за этого `openPreviewInBrowser` не попал
 * в «зовут, но не отдаём», хотя кнопка «в браузере» отвечала отказом.
 *
 * ПОДОБЪЕКТЫ ИСКЛЮЧЕНЫ ЛОВУШКОЙ ЛУКАХЕДА, и это половина работы: у донора
 * полно строк вида `const api = window.hermesDesktop?.api`, и без неё детектор
 * приписывал мосту листья чужих разделов — `get`, `set`, `run`, `close`, даже
 * `readAsDataURL` от `FileReader`, попавшего под то же имя. Замер: 66 «скрытых»
 * имён шума против 25 настоящих. Разделы первого уровня (`api`, `settings`,
 * `terminal`, `zoom`) детектор и так видит прямым обращением — единицей учёта
 * остаётся член моста, а не лист внутри раздела. */
function bridgeAliases(source: string): string[] {
  const direct = [
    ...source.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*window\.hermesDesktop!?(?![\w$?.!])/g
    )
  ].map((match) => match[1])

  return [...new Set(direct)]
}

/** Имена, снятые деструктуризацией: `const { openExternal } = window.hermesDesktop`.
 * Берётся имя ЧЛЕНА (до двоеточия), а не местное — переименование не должно
 * прятать вызов. */
function destructuredMembers(source: string): string[] {
  const out: string[] = []

  for (const match of source.matchAll(
    /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*window\.hermesDesktop\b/g
  )) {
    for (const part of match[1].split(',')) {
      const name = part.split(':')[0].split('=')[0].trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name)
    }
  }

  return out
}

/** Имя члена → файлы, которые его зовут. Обращения через тип
 * (`Window['hermesDesktop']`) сюда не попадают: там нет точки после имени. */
function calledMembers(): Map<string, string[]> {
  const found = new Map<string, string[]>()

  const remember = (name: string, path: string): void => {
    const callers = found.get(name) ?? []
    if (!callers.includes(path)) callers.push(path)
    found.set(name, callers)
  }

  for (const file of donorFiles(DONOR_DIR)) {
    for (const match of file.source.matchAll(/hermesDesktop\??\.([A-Za-z_$][\w$]*)/g)) {
      remember(match[1], file.path)
    }

    for (const alias of bridgeAliases(file.source)) {
      // Точка ПЕРЕД псевдонимом запрещена: в зоне лежит
      // `Symbol.for('hermes.desktop.gatewayRegistryState')`, и по границе слова
      // детектор принял бы кусок строкового ключа за вызов `desktop.<член>`.
      for (const match of file.source.matchAll(
        new RegExp('(?<![\\w$.])' + alias + '\\??\\.([A-Za-z_$][\\w$]*)', 'g')
      )) {
        remember(match[1], file.path)
      }
    }

    for (const name of destructuredMembers(file.source)) remember(name, file.path)
  }

  return found
}

/** Ключи `IMPLEMENTED` в шиме — и методы (`name(`, `async name(`, `name<T>(`),
 * и значения (`name:`), включая объявленные отсутствующими. */
function shimMembers(): { declared: Set<string>; absent: Set<string> } {
  const shim = readFileSync(SHIM, 'utf-8')
  const start = shim.indexOf('{', shim.indexOf('const IMPLEMENTED'))
  let depth = 0
  let body = ''

  for (let index = start; index < shim.length; index += 1) {
    if (shim[index] === '{') depth += 1
    else if (shim[index] === '}') {
      depth -= 1
      if (depth === 0) {
        body = shim.slice(start, index)
        break
      }
    }
  }

  if (!body) throw new Error('не нашёлся блок IMPLEMENTED в hermes-desktop-shim.ts')

  const declared = new Set<string>()
  const absent = new Set<string>()

  for (const match of body.matchAll(/^ {2}(?:async )?([A-Za-z_$][\w$]*)\??\s*([<(:])(.*)$/gm)) {
    declared.add(match[1])
    if (match[2] === ':' && match[3].trim().startsWith('undefined')) absent.add(match[1])
  }

  return { declared, absent }
}

/** Объявление члена в ИХ контракте — от строки имени до следующего ЧЛЕНА того
 * же отступа.
 *
 * Границей служит начало следующего члена, а не любая непробельная строка того
 * же отступа: у многострочной подписи закрывающая скобка стоит на этом же
 * отступе (`      }) => Promise<HermesConnection>`), и по ней блок обрывался
 * ровно перед типом возврата — то есть промис читался как «не промис». Первый
 * же прогон гейта это и показал. */
function declarationOf(contract: string, name: string): string {
  const lines = contract.split(/\r?\n/)
  const head = lines.findIndex((line) => new RegExp(`^ {6}${name}\\??:`).test(line))
  if (head < 0) return ''

  const rest = lines.slice(head + 1).findIndex((line) => /^ {6}[A-Za-z_$][\w$]*\??:/.test(line))
  return lines.slice(head, rest < 0 ? undefined : head + 1 + rest).join('\n')
}

/** Умеет ли заглушка ответить на этот член честно.
 *
 * Промис — да: вызов отклоняется с именем члена. Подписка `on…` — да: заглушка
 * отдаёт пустую «отписку», и их код спокойно её зовёт.
 *
 * РАЗДЕЛ (`name: { … }`) — НЕТ, даже если внутри одни промисы: врёт не вызов
 * листа, а САМО НАЛИЧИЕ раздела. `Boolean(window.hermesDesktop?.terminal)` с
 * прокси отвечает «да», и экран рисует возможность, которой нет. Смотреть
 * поэтому надо первую строку объявления, а не весь блок.
 *
 * Всё остальное — тоже нет: прокси истинен там, где ждут булево или строку. */
function canFailHonestly(declaration: string, name: string): boolean {
  // Именно `имя: {`, а не любая строка, кончающаяся скобкой: у функции с
  // объектным доводом первая строка тоже ей кончается (`(payload: {`), и
  // такая подпись — обычный промис, а не раздел.
  if (/^ *[A-Za-z_$][\w$]*\??:\s*\{\s*$/.test(declaration.split('\n', 1)[0])) return false
  if (/=>\s*Promise</.test(declaration)) return true
  return /^on[A-Z]/.test(name) && /=>\s*\(\)\s*=>\s*void/.test(declaration)
}

describe('члены их моста против реализованных (находка D-41)', () => {
  const called = calledMembers()
  const { declared, absent } = shimMembers()
  const unbridged = [...called.keys()].filter((name) => !declared.has(name)).sort()

  it('обе стороны вообще прочитались — иначе проверка пустая', () => {
    expect(called.size, 'зона донора зовёт мост').toBeGreaterThan(50)
    expect(declared.size, 'шим что-то объявляет').toBeGreaterThan(30)
  })

  it('список непроброшенных членов не изменился молча', () => {
    const appeared = unbridged.filter((name) => !UNBRIDGED.includes(name))
    const gone = UNBRIDGED.filter((name) => !unbridged.includes(name))

    expect(
      appeared.map((name) => `${name} ← ${(called.get(name) ?? []).join(', ')}`),
      'перенесли экран и не решили про его члены: пробросить, объявить отсутствующим или внести в UNBRIDGED'
    ).toEqual([])

    expect(gone, 'член проброшен или больше не зовётся — убрать из UNBRIDGED').toEqual([])
  })

  it('член, на форме которого заглушка соврала бы, объявлен отсутствующим', () => {
    const contract = readFileSync(CONTRACT, 'utf-8')
    const lying = unbridged.filter((name) => {
      if (absent.has(name)) return false
      const declaration = declarationOf(contract, name)
      return declaration !== '' && !canFailHonestly(declaration, name)
    })

    expect(
      lying,
      'их контракт обещает здесь не промис — заглушка отдаст истинный прокси вместо булева, строки или отсутствующего раздела; объявить `<член>: undefined` в IMPLEMENTED'
    ).toEqual([])
  })
})
