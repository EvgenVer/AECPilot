// Правый клик — электронная половина (задача 3E.10, UR37). Правила и разбор
// присланного окном — в `context-menu-pure.ts` рядом с их тестами.

import { session, webContents, type BrowserWindow, type WebContents } from 'electron'

import { pickSpellCheckLanguages, type SpellcheckAction } from './context-menu-pure'

/** Координаты последнего правого клика — по окнам.
 *
 * Единственный способ скопировать картинку в Chromium — `copyImageAt(x, y)`, а
 * координаты видел только главный процесс: у окна есть своё событие
 * `contextmenu`, но байтов картинки оно не отдаёт. Отсюда карта: жест
 * запоминается здесь, а меню окна потом просит «скопируй ту картинку». */
const lastGesture = new Map<number, { x: number; y: number }>()

/** Подписка на событие Chromium: запомнить жест и передать окну то, что оно
 * само увидеть не может, — слово с ошибкой и предложения замены. */
export function installContextMenuBridge(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    lastGesture.set(win.webContents.id, { x: params.x, y: params.y })

    // Только для поля ввода и только когда ошибка есть: их меню дополняется
    // этими фактами уже открытым, и пустая посылка ему ни к чему.
    if (params.isEditable && params.misspelledWord) {
      win.webContents.send('context-menu-spellcheck:facts', {
        misspelledWord: params.misspelledWord,
        suggestions: Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : []
      })
    }
  })

  win.webContents.once('destroyed', () => lastGesture.delete(win.webContents.id))
}

export function copyImageAtLastGesture(contents: WebContents): void {
  const point = lastGesture.get(contents.id)
  if (point) contents.copyImageAt(point.x, point.y)
}

export function applySpellcheckAction(contents: WebContents, action: SpellcheckAction): void {
  if (action.kind === 'replace') contents.replaceMisspelling(action.word)
  else contents.session.addWordToSpellCheckerDictionary(action.word)
}

/**
 * Слово в словарь встроенной страницы предпросмотра.
 *
 * Тег `webview` отдаёт рендереру `replaceMisspelling`, но НЕ отдаёт сессию,
 * поэтому «добавить в словарь» для встроенной страницы может только главный
 * процесс, а окно называет страницу её `webContentsId`. Своего окна тег у нас
 * пока нет — он включается задачей 3E.5, — но канал принадлежит этому меню, и
 * оставлять его непроброшенным значило бы отдать их коду молчаливую заглушку
 * на пункте, который человек видит.
 */
export function addWordToGuestDictionary(webContentsId: number, word: string): void {
  const guest = webContents.fromId(webContentsId)
  if (guest && !guest.isDestroyed()) guest.session.addWordToSpellCheckerDictionary(word)
}

/**
 * Включить проверку орфографии. Зовётся один раз при старте.
 *
 * На Windows и Linux Chromium скачивает словарь Hunspell по требованию и без
 * явного списка языков не включает ни одного; на macOS работает проверка
 * системы, и список ей не нужен — там `available` приходит пустым, и мы ничего
 * не трогаем.
 */
export function configureSpellChecker(): string[] {
  const target = session.defaultSession
  if (typeof target?.setSpellCheckerLanguages !== 'function') return []

  const languages = pickSpellCheckLanguages(target.availableSpellCheckerLanguages ?? [])
  if (languages.length === 0) return []

  try {
    target.setSpellCheckerLanguages(languages)
  } catch (error: unknown) {
    // Проверка орфографии — удобство; окно должно открыться и без неё.
    console.error('aecpilot: spellchecker setup failed', error)
    return []
  }

  return languages
}
