// Жесты «назад / вперёд / обновить» для встроенной страницы (задача 3E.5, UR31).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ КАНАЛ, ЕСЛИ У СТРАНИЦЫ ЕСТЬ СВОИ КНОПКИ. Потому что жест
// приходит НЕ в страницу. Боковая кнопка мыши приезжает в главный процесс как
// `app-command`, свайп по трекпаду — как `swipe`, и ни то ни другое рендерер не
// видит. Если их не перехватить, Chromium применяет их к документу САМОГО
// приложения: окно уходит по своей истории назад, и человек, целившийся в
// страницу, теряет интерфейс.
//
// ДВА АДРЕСАТА, И ПОРЯДОК ВАЖЕН. Когда фокус ВНУТРИ гостя, отвечает главный
// процесс: только он видит, какой webContents сейчас в фокусе, и ходить за этим
// в окно и обратно значило бы гонку. Когда фокус в интерфейсе — жест уезжает в
// окно, и там их сторона решает, есть ли открытая панель предпросмотра;
// `reload` при этом имеет запасной смысл (перезагрузить окно), а `back` и
// `forward` вне браузера не значат ничего и просто гаснут.

import { webContents as electronWebContents, type BrowserWindow } from 'electron'

export type PreviewNavCommand = 'back' | 'forward' | 'reload'

/** Выполняет жест на госте, если фокус в нём. Возвращает `true`, когда жест
 * израсходован здесь и в окно посылать нечего — в том числе когда идти некуда:
 * «назад» в начале истории это не «передать дальше», это «уже некуда». */
function commandFocusedGuest(command: PreviewNavCommand): boolean {
  const focused = electronWebContents.getFocusedWebContents()

  if (!focused || focused.isDestroyed() || focused.getType() !== 'webview') return false

  const history = focused.navigationHistory

  if (command === 'reload') {
    focused.reload()
    return true
  }

  if (command === 'back') {
    if (history.canGoBack()) history.goBack()
    return true
  }

  if (history.canGoForward()) history.goForward()
  return true
}

/** Просит окно применить жест к своей панели предпросмотра. */
export function sendPreviewNavCommand(
  win: BrowserWindow | undefined,
  command: PreviewNavCommand
): void {
  if (commandFocusedGuest(command)) return
  if (!win || win.isDestroyed()) return

  const { webContents } = win
  if (!webContents || webContents.isDestroyed()) return

  webContents.send('preview-nav', command)
}

/** Подписывает окно на жесты, которые сами до рендерера не доходят. */
export function installBrowserNavGestures(win: BrowserWindow): void {
  win.on('swipe', (_event, direction) => {
    // Свайп ВЛЕВО двигает страницу влево, открывая то, что за ней, — это
    // «назад». Так же ведут себя Safari, Chrome и проводник.
    if (direction === 'left') sendPreviewNavCommand(win, 'back')
    else if (direction === 'right') sendPreviewNavCommand(win, 'forward')
  })

  win.on('app-command', (event, command) => {
    if (command !== 'browser-backward' && command !== 'browser-forward') return

    // Забираем жест в любом случае: неперехваченным Chromium применит его к
    // документу приложения, и назад уйдёт САМ интерфейс.
    event.preventDefault()
    sendPreviewNavCommand(win, command === 'browser-backward' ? 'back' : 'forward')
  })
}
