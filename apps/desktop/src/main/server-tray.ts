// Задачи T31/T32 (решения владельца 2026-10-16 и 2026-10-19). Установка «только
// сервер» живёт без окна: значок в трее говорит, работает ли шлюз, и даёт ровно то,
// что нужно на серверной машине, — скопировать постоянный токен подключения для
// клиента, выдать новый (старый перестаёт действовать) и остановить сервер.

import { clipboard, dialog, Menu, Tray, type NativeImage } from 'electron'

import { mainT } from './i18n'

export type ServerState = 'starting' | 'running' | 'failed'

export interface ServerTrayOptions {
  getIcon: () => Promise<NativeImage>
  /** Действующий токен — только в буфер обмена по явному действию, нигде не пишется. */
  getToken: () => string
  /** Новый токен и перезапуск шлюза с ним. */
  rotateToken: () => Promise<void>
  quit: () => void
}

export interface ServerTray {
  setState(state: ServerState): void
}

export async function createServerTray(options: ServerTrayOptions): Promise<ServerTray> {
  const tray = new Tray(await options.getIcon())
  tray.setToolTip(mainT('serverTray.tooltip'))
  let state: ServerState = 'starting'

  const confirmRotate = async (): Promise<void> => {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: [mainT('serverTray.newTokenButton'), mainT('serverTray.cancel')],
      defaultId: 1,
      cancelId: 1,
      message: mainT('serverTray.newToken'),
      detail: mainT('serverTray.newTokenConfirm')
    })
    if (response !== 0) return
    state = 'starting'
    render()
    await options.rotateToken()
  }

  const render = (): void => {
    const status =
      state === 'running'
        ? mainT('serverTray.running')
        : state === 'failed'
          ? mainT('serverTray.failed')
          : mainT('serverTray.starting')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: status, enabled: false },
        { type: 'separator' },
        {
          label: mainT('serverTray.copyToken'),
          click: () => {
            clipboard.writeText(options.getToken())
            if (process.platform === 'win32') {
              tray.displayBalloon({
                title: mainT('serverTray.tooltip'),
                content: mainT('serverTray.copied')
              })
            }
          }
        },
        {
          label: mainT('serverTray.newToken'),
          click: () => {
            void confirmRotate()
          }
        },
        { type: 'separator' },
        { label: mainT('serverTray.quit'), click: options.quit }
      ])
    )
  }

  render()
  return {
    setState(next) {
      state = next
      render()
    }
  }
}
