// Задачи T31/T32 (решения владельца 2026-10-16 и 2026-10-19). Установка «только
// сервер» живёт без окна: значок в трее говорит, работает ли шлюз, и даёт ровно то,
// что нужно на серверной машине, — скопировать постоянный токен подключения для
// клиента, выдать новый (старый перестаёт действовать), задать ключи моделей (T35.2)
// и остановить сервер.

import { clipboard, dialog, Menu, Tray, type NativeImage } from 'electron'

import type { DictationStatus } from '../shared/ipc'
import type { Dictation } from './dictation'
import { mainT } from './i18n'

export type ServerState = 'starting' | 'running' | 'failed'

export interface ServerTrayOptions {
  getIcon: () => Promise<NativeImage>
  /** Действующий токен — только в буфер обмена по явному действию, нигде не пишется. */
  getToken: () => string
  /** Новый токен и перезапуск шлюза с ним. */
  rotateToken: () => Promise<void>
  /** Окно «Ключи моделей» на этой машине (T35.2). */
  openKeys: () => void
  /** Модель диктовки для клиентов (T59, UR49): распознаёт машина, где работает ядро. */
  dictation: Pick<Dictation, 'status' | 'setup' | 'remove'>
  quit: () => void
}

export interface ServerTray {
  setState(state: ServerState): void
  setDictation(status: DictationStatus): void
}

export async function createServerTray(options: ServerTrayOptions): Promise<ServerTray> {
  const tray = new Tray(await options.getIcon())
  tray.setToolTip(mainT('serverTray.tooltip'))
  let state: ServerState = 'starting'
  let voice: DictationStatus | null = null
  let asking = false

  // Согласие — здесь же, на серверной машине: клиент по сети ничего на неё не скачает.
  const dictationStep = async (): Promise<void> => {
    const now = await options.dictation.status()
    if (now.busy) return
    const { response } = await dialog.showMessageBox(
      now.installed
        ? {
            type: 'question',
            buttons: [mainT('dictation.removeButton'), mainT('serverTray.cancel')],
            defaultId: 1,
            cancelId: 1,
            message: mainT('dictation.removeTitle'),
            detail: mainT('dictation.removeDetail')
          }
        : {
            type: 'question',
            buttons: [mainT('dictation.downloadButton'), mainT('serverTray.cancel')],
            defaultId: 0,
            cancelId: 1,
            message: mainT('dictation.downloadTitle'),
            detail: mainT(
              'dictation.downloadDetail',
              now.model.repo,
              Math.round(now.model.sizeBytes / 1_000_000),
              now.model.license
            )
          }
    )
    if (response !== 0) return
    const outcome = now.installed
      ? await options.dictation.remove()
      : await options.dictation.setup()
    if (outcome.ok) return
    await dialog.showMessageBox({
      type: 'error',
      message: mainT('dictation.failed'),
      detail: outcome.error ?? ''
    })
  }

  const dictationLabel = (): string => {
    if (!voice?.busy) {
      return mainT(voice?.installed ? 'dictation.trayOn' : 'dictation.trayOff')
    }
    const progress = voice.progress
    const percent = progress ? Math.floor((progress.doneBytes * 100) / progress.totalBytes) : 0
    return mainT('dictation.trayBusy', percent)
  }

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
          click: async () => {
            // Electron 44 (T52): writeText is a Promise; the balloon waits for it.
            await clipboard.writeText(options.getToken()).catch(() => undefined)
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
        { label: mainT('serverTray.keys'), click: options.openKeys },
        {
          label: dictationLabel(),
          enabled: !voice?.busy,
          click: () => {
            // One question at a time: the second dialog would act on what the first changed.
            if (asking) return
            asking = true
            void dictationStep().finally(() => {
              asking = false
            })
          }
        },
        { type: 'separator' },
        { label: mainT('serverTray.quit'), click: options.quit }
      ])
    )
  }

  // Меню пересобирается на каждое изменение: у загрузки это два раза в секунду, поэтому
  // только при новой подписи.
  const setDictation = (next: DictationStatus): void => {
    const before = dictationLabel()
    voice = next
    if (dictationLabel() !== before) render()
  }

  render()
  void options.dictation
    .status()
    .then(setDictation)
    .catch(() => {})
  return {
    setState(next) {
      state = next
      render()
    },
    setDictation
  }
}
