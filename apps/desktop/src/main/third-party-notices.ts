// Задача T43.2 (SPEC A8): лицензии сторонних компонентов из программы. Файл
// `THIRD-PARTY-NOTICES.txt` собирает сборка (`third-party-notices.cjs`) прямо в папку
// установки; команда палитры открывает его программой Windows для текста. В рабочей
// копии файла нет — окно получает понятный отказ.

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { ipcMain, shell } from 'electron'

import { mainT } from './i18n'

/** Корень установки — четыре уровня вверх от `out/main`, как у `runtime/hermes-env.mjs`
 *  (electron-builder.config.cjs: `<root>/resources/app.asar/out/main`). */
export function noticesPath(mainDir: string = __dirname): string {
  return join(mainDir, '..', '..', '..', '..', 'THIRD-PARTY-NOTICES.txt')
}

export function installThirdPartyNotices(): void {
  ipcMain.handle('licenses:open-notices', async () => {
    const file = noticesPath()
    if (!existsSync(file)) return { ok: false, error: mainT('licenses.noticesMissing') }
    const failure = await shell.openPath(file)
    return failure ? { ok: false, error: failure } : { ok: true }
  })
}
