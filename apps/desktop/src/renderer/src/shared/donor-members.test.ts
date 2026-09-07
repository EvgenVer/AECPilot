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
  'cancelBootstrap',
  'desktopPluginsRoot',
  'fetchLinkTitle',
  'getAgentRoster',
  'getRemoteDisplayReason',
  'installDesktopPlugin',
  'normalizePreviewTarget',
  'onClosePreviewRequested',
  'onFoundInPage',
  'onOpenFindBarRequested',
  'onOpenFolderRequested',
  'onOpenUpdatesRequested',
  'onPreviewFileChanged',
  'onWindowStateChanged',
  'openDir',
  'probeConnectionConfig',
  'probePluginRepo',
  'readClipboard',
  'readFileDataUrlForAttach',
  // 'readFileText' снят при подъёме на 0.21.0 (задача 3.B3): единственный
  // вызов, который видит детектор ниже, стоял в
  // `components/assistant-ui/inline-preview-directive.tsx` и у донора исчез.
  // ОСТОРОЖНО, и поэтому запись остаётся комментарием, а не удалением: член
  // ВСЁ ЕЩЁ зовут — `contrib/runtime-loader.ts` делает
  // `const desktop = window.hermesDesktop` и потом `desktop.readFileText(…)`,
  // а детектор ищет буквальное `hermesDesktop.имя` и такой псевдоним не видит
  // (не видел и на 0.20.6). Живой поломки нет: загрузчик десктопных плагинов
  // исключён HX5. Слепое пятно детектора — находка D-63.
  'repairBootstrap',
  'resetBootstrap',
  'revealPath',
  'sanitizeWorkspaceCwd',
  'setSecretStorageEncryption',
  'stopPreviewFileWatch',
  'watchPreviewFile',
  'writeClipboard'
].sort()

/** Каждый `.ts`/`.tsx` зоны донора, вместе с путём. */
function donorFiles(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...donorFiles(full))
    else if (/\.tsx?$/.test(entry.name))
      out.push({ path: full, source: readFileSync(full, 'utf-8') })
  }

  return out
}

/** Имя члена → файлы, которые его зовут. Обращения через тип
 * (`Window['hermesDesktop']`) сюда не попадают: там нет точки после имени. */
function calledMembers(): Map<string, string[]> {
  const found = new Map<string, string[]>()

  for (const file of donorFiles(DONOR_DIR)) {
    for (const match of file.source.matchAll(/hermesDesktop\??\.([A-Za-z_$][\w$]*)/g)) {
      const callers = found.get(match[1]) ?? []
      if (!callers.includes(file.path)) callers.push(file.path)
      found.set(match[1], callers)
    }
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
