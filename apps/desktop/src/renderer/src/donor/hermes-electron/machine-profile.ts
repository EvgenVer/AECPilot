/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/electron/machine-profile.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import * as fs from 'node:fs'
import * as os from 'node:os'

import { app, ipcMain } from 'electron'

export interface MachineProfile {
  ageDays: number | null
  arch: string
  locale: string
  platform: NodeJS.Platform
  release: string
  username: string
}

export function registerMachineProfile(): void {
  ipcMain.handle('hermes:machine:profile', readMachineProfile)
}

function readMachineProfile(): MachineProfile {
  let ageDays: number | null = null
  let username = ''

  // Home birthtime approximates account age. Unsupported filesystems leave it unknown.
  try {
    const { birthtimeMs } = fs.statSync(os.homedir())

    if (birthtimeMs > 0) {
      ageDays = Math.max(0, Math.floor((Date.now() - birthtimeMs) / 86_400_000))
    }
  } catch {
    // Unknown age must not make a daily-use machine look newly set up.
  }

  try {
    username = os.userInfo().username
  } catch {
    // The guide can ask for a name without suggesting an OS login.
  }

  return {
    ageDays,
    arch: process.arch,
    locale: app.getLocale() || '',
    platform: process.platform,
    release: os.release(),
    username
  }
}
