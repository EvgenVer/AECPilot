// Временный профиль ядра для живого стенда (задача 3F.1). Копия
// `runtime/dev-profile` целиком — с `.env` ФАЙЛОМ (решение владельца
// 2026-09-17): содержимое не читается и не печатается ничем, папка удаляется
// по концу прогона. Без копии живое ядро в тестах либо портило бы профиль
// разработчика, либо шло бы без ключа, а без ключа половина чек-листа не
// проходится по определению.

import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const repoRoot = join(__dirname, '..', '..', '..', '..')
export const devProfileDir = join(repoRoot, 'runtime', 'dev-profile')
export const PROFILE_PREFIX = 'aecpilot-acceptance-profile-'

/** Что не едет в копию: резервные копии прошлых пинов и журналы — они большие
 *  и к поведению ядра отношения не имеют. Базы SQLite едут вместе со своими
 *  `-wal`/`-shm`: без них копия базы отстаёт от живой. */
function skip(entry: string): boolean {
  const name = basename(entry)
  return name.startsWith('.bak-') || name === 'serve.log' || name === 'logs'
}

/** Скопировать dev-profile во временную папку и вернуть её путь. */
export function prepareProfile(): string {
  if (!existsSync(join(devProfileDir, 'config.yaml'))) {
    throw new Error(`dev-profile не найден: ${devProfileDir} — сначала node runtime/setup.mjs`)
  }
  const dir = mkdtempSync(join(tmpdir(), PROFILE_PREFIX))
  cpSync(devProfileDir, dir, {
    recursive: true,
    filter: (source) => !skip(source)
  })
  return dir
}

/** Удалить временный профиль. Базы ядра могут отпускаться с задержкой после
 *  выхода процесса — несколько попыток, затем честное предупреждение. */
export function removeProfile(dir: string): void {
  if (!dir.includes(PROFILE_PREFIX)) {
    throw new Error(`отказ удалять не временный профиль: ${dir}`)
  }
  if (process.env.AEC_KEEP_PROFILE) {
    console.warn(`[e2e] профиль оставлен: ${dir}`)
    return
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(dir, { force: true, recursive: true, maxRetries: 3, retryDelay: 500 })
      if (!existsSync(dir)) return
    } catch {
      // следующая попытка
    }
  }
  console.warn(`[e2e] временный профиль не удалился, остался: ${dir}`)
}
