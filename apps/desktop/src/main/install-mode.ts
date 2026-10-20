// Задача T31: чтение режима установки с диска и роль этого запуска. Решения — в
// `install-mode-pure.ts`.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { installRoot } from './aec-rag-command'
import { appRole, parseInstallMode, type AppRole, type InstallMode } from './install-mode-pure'

function readMode(): InstallMode | null {
  try {
    return parseInstallMode(readFileSync(join(installRoot(), 'install-mode.txt'), 'utf-8'))
  } catch {
    return null
  }
}

let role: AppRole | undefined

/** Роль процесса на всё время его жизни: режим установки не меняется на ходу. */
export function currentRole(): AppRole {
  role ??= appRole(readMode(), process.argv)
  return role
}
