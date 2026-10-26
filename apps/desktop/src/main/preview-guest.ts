// Надзор за встроенной страницей — сторона Electron (задача 3E.5, риск R22).
//
// Решение о переходе принимает `preview-nav-policy.ts` (чистый, задача 3E.4);
// здесь — подписка на события гостя, вопрос человеку и загрузка подтверждённого
// адреса. Разделено ровно по этой линии: правило проверяется тестами без
// Electron, а всё, что требует живого окна, остаётся тонким.
//
// ПОЧЕМУ НАДЗОР ЖИВЁТ ЗДЕСЬ, А НЕ В ОКНЕ. Окно у нас недоверенная сторона
// (`docs/THREAT_MODEL.md`), а страница живёт внутри окна. Правило, стоящее рядом с
// тем, от чего оно защищает, защищает не от него. `web-contents-created` —
// единственная точка, где главный процесс видит гостя раньше, чем гость видит
// сеть.
//
// ЧТО СЧИТАЕТСЯ «ОТКРЫТЫМ АДРЕСОМ». Тот, с которого началась последняя
// НЕ ОТКЛОНЁННАЯ навигация: `did-start-navigation`. Он ставится и на загрузку
// из адресной строки, и на переход по ссылке, который мы пропустили. Разница
// принципиальная: `will-navigate` в Electron не приходит на программную
// загрузку (`loadURL`), то есть адрес, введённый ЧЕЛОВЕКОМ, границу не
// проверяет и не должен — это и есть человеческое решение.
//
// ПЕРЕНАПРАВЛЕНИЯ СЕРВЕРА (`will-redirect`) проверяются тем же правилом.
// Отравленная страница уводит агента не только ссылкой: ответ `302` на чужой
// хост — тот же увоз адреса, только без клика.

import { app, dialog, BrowserWindow, type WebContents } from 'electron'

import { decidePreviewNavigation, describeNavigation } from './preview-nav-policy'
import { mainT } from './i18n'

/** Адрес, с которого шла последняя разрешённая навигация каждого гостя. */
const openedByGuest = new Map<number, string>()

/** Гости, у которых вопрос уже висит: второй диалог на тот же гость превратил
 * бы страницу с двумя перенаправлениями в очередь модальных окон. */
const asking = new Set<number>()

/** Что показать человеку. Отдельной функцией, чтобы текст вопроса читался
 * целиком: в нём важно, КУДА уводят, а не то, что «страница хочет перейти». */
function askText(target: string): { message: string; detail: string } {
  const { host, address } = describeNavigation(target)

  return {
    message: host ? mainT('preview.navMessageHost', host) : mainT('preview.navMessageOther'),
    detail: mainT('preview.navDetail', address)
  }
}

async function confirmNavigation(contents: WebContents, target: string): Promise<boolean> {
  const owner = BrowserWindow.fromWebContents(contents.hostWebContents ?? contents)
  const { message, detail } = askText(target)
  const options = {
    type: 'question' as const,
    buttons: [mainT('preview.navGo'), mainT('preview.navStay')],
    defaultId: 1,
    cancelId: 1,
    message,
    detail
  }

  const answer = owner
    ? await dialog.showMessageBox(owner, options)
    : await dialog.showMessageBox(options)

  return answer.response === 0
}

/** Общий разбор для `will-navigate` и `will-redirect`. */
function guardNavigation(
  contents: WebContents,
  event: { preventDefault: () => void },
  url: string
): void {
  const decision = decidePreviewNavigation(openedByGuest.get(contents.id) ?? '', url)

  if (decision.action === 'allow') return

  event.preventDefault()

  // `javascript:`, `file:`, `data:` — это не переход, а побег из источника или
  // доступ к диску. Спрашивать нечестно: правильного ответа «да» тут нет.
  if (decision.action === 'deny') {
    console.warn(`aecpilot: preview navigation refused (${decision.reason}): ${url.slice(0, 200)}`)
    return
  }

  if (asking.has(contents.id)) return
  asking.add(contents.id)

  confirmNavigation(contents, url)
    .then((yes) => {
      if (!yes || contents.isDestroyed()) return
      // Загрузка отсюда программная: `will-navigate` на неё не придёт, и
      // повторного вопроса не будет. Адрес запомнится в `did-start-navigation`.
      contents.loadURL(url).catch(() => {})
    })
    .catch(() => {})
    .finally(() => {
      asking.delete(contents.id)
    })
}

/**
 * Ставит надзор на каждого будущего гостя. Зовётся один раз при запуске, до
 * создания окна: `web-contents-created` не отдаёт уже созданных.
 */
export function installPreviewGuestGuard(): void {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return

    contents.on('will-navigate', (event, url) => guardNavigation(contents, event, url))
    contents.on('will-redirect', (event, url) => guardNavigation(contents, event, url))

    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return
      openedByGuest.set(contents.id, details.url)
    })

    // Новое окно из встроенной страницы не открывается никогда: окно без нашей
    // рамки — это тот же побег, только с собственной адресной строкой. Ссылку
    // человек откроет в системном браузере кнопкой, которая для этого и есть.
    contents.setWindowOpenHandler(({ url }) => {
      console.warn(`aecpilot: preview window.open refused: ${url.slice(0, 200)}`)
      return { action: 'deny' }
    })

    contents.on('destroyed', () => {
      openedByGuest.delete(contents.id)
      asking.delete(contents.id)
    })
  })
}
