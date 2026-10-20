// Задача T33: папка проекта выбирается там, где работает ядро. При подключении к
// серверу проект живёт на ЕГО диске, и местный диалог показал бы не те папки — тогда
// открывается их удалённый выбор папки (`right-sidebar/files/remote-picker.tsx`,
// ходит в `/api/fs/list` ядра); иначе — системный диалог главного процесса, как прежде.

import { isDesktopFsRemoteMode, selectDesktopPaths } from '../../donor/lib/desktop-fs'

export async function pickProjectFolder(title?: string): Promise<string | null> {
  if (isDesktopFsRemoteMode()) {
    const [picked] = await selectDesktopPaths({ directories: true, title })
    return picked ?? null
  }
  return window.aecpilot.pickProjectDirectory()
}
