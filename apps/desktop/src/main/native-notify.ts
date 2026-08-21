// Уведомления операционной системы (задача 3.28) — сторона Electron.
//
// ЗАЧЕМ. Ночной прогон длится часами, и человек в это время в другом окне или
// вообще не за столом. Тост системы — единственный способ сказать «готово» тому,
// кто не смотрит на приложение. Их хранилище уведомлений (`store/
// native-notifications.ts`) уже решает КОГДА и КОМУ: переключатели по видам,
// молчание, пока окно на виду, защита от повторов. Здесь — только показ.
//
// ЧТО ДЕЛАЕТ ЩЕЛЧОК. Уведомление приходит снаружи приложения, поэтому щелчок по
// нему обязан привести человека туда, где событие произошло: окно поднимается,
// и в рендерер уходит номер сессии — их `onFocusSession` открывает её РЯДОМ с
// тем, что уже на экране, а не поверх (их решение, см. use-desktop-integrations).
//
// ПРО КНОПКИ В ТОСТЕ. `actions` в Electron — только macOS; на Windows они не
// рисуются, и событие `action` там не приходит. Это не наш недосмотр и не то,
// что можно обойти в рендерере: кнопки на Windows требуют собственного XML
// тоста мимо Electron. Поэтому щелчок по телу уведомления сделан САМОСТОЯТЕЛЬНЫМ
// путём — он приводит к сессии, где ответ на запрос виден и так.

import { app, BrowserWindow, Notification } from 'electron'

import { planNotification, type NotifyRequest } from './notify-pure'

/** Идентификатор приложения для Windows. Без него система не покажет тост:
 * она сопоставляет уведомление с ярлыком в меню «Пуск» по этому имени.
 *
 * ВАЖНО при сборке инсталлятора (задачи 6.2/3.21): `appId` установщика должен
 * совпадать с этой строкой, иначе уведомления перестанут появляться у
 * установленного приложения, продолжая работать у разработчика. */
export const APP_USER_MODEL_ID = 'com.aecpilot.desktop'

export function installNotifications(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID)
}

/** Поднимает окно приложения — щелчок по уведомлению должен показать то, о чём
 * оно. Свёрнутое окно разворачивается: иначе «показать» ничего не покажет. */
function raiseWindow(): void {
  const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

/** Показывает уведомление. `false` — показать было нечего или система
 * уведомления не поддерживает; их вызывающая сторона читает это как «не
 * показали», а не как ошибку. */
export function showNativeNotification(request: unknown): boolean {
  if (!Notification.isSupported()) return false

  const plan = planNotification(request as NotifyRequest | undefined)
  if (!plan) return false

  const notification = new Notification({
    title: plan.title,
    body: plan.body,
    silent: plan.silent,
    actions: plan.actions.map((action) => ({ type: 'button' as const, text: action.text }))
  })

  notification.on('click', () => {
    raiseWindow()
    if (plan.sessionId !== '') broadcast('notification:focus-session', plan.sessionId)
  })

  // macOS. См. «ПРО КНОПКИ В ТОСТЕ» в шапке.
  notification.on('action', (_event, index) => {
    const action = plan.actions[index]
    if (!action) return
    raiseWindow()
    broadcast('notification:action', {
      actionId: action.id,
      ...(plan.sessionId === '' ? {} : { sessionId: plan.sessionId })
    })
  })

  // Тост может не показаться по причинам вне приложения (политика системы,
  // «не беспокоить», отсутствующий ярлык). Молча — значит невоспроизводимо,
  // поэтому причина уходит в журнал (задача 3.29).
  notification.on('failed', (_event, error) => {
    console.error('aecpilot: OS notification failed', error)
  })

  notification.show()
  return true
}
