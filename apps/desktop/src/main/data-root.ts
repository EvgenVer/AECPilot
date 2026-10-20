// Imported first by `index.ts` for its side effect (tasks T39, T41): `userData` has to be
// set before any module asks for it — `index.ts` itself reads it at load time — and
// before `ready`; the environment before any child is spawned.

import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import { installRoot } from './aec-rag-command'
import {
  dataEnvDirs,
  installedDataDir,
  installedDataEnv,
  installedUserData
} from './data-root-pure'

const dataDir = installedDataDir({ root: installRoot(), exists: existsSync })

if (dataDir) {
  const dataEnv = installedDataEnv(dataDir, process.env)
  for (const dir of dataEnvDirs(dataEnv)) mkdirSync(dir, { recursive: true })
  Object.assign(process.env, dataEnv)
  app.setPath('temp', dataEnv.TEMP)

  const userData = installedUserData(dataDir, app.commandLine.hasSwitch('user-data-dir'))
  if (userData) {
    mkdirSync(userData, { recursive: true })
    app.setPath('userData', userData)
    app.setPath('sessionData', userData)
    // Electron derives these from `appData` on Windows, not from `userData`.
    app.setPath('crashDumps', join(userData, 'Crashpad'))
    app.setPath('logs', join(userData, 'logs'))
  }
}
