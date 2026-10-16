// Временный профиль ядра для живого стенда (задача 3F.1). Копия
// `runtime/e2e-profile` целиком — с `.env` ФАЙЛОМ (решение владельца
// 2026-09-17): содержимое не читается и не печатается ничем, папка удаляется
// по концу прогона. Без копии живое ядро в тестах либо портило бы профиль
// разработчика, либо шло бы без ключа, а без ключа половина чек-листа не
// проходится по определению.
//
// Профиль автотестов отделён от `runtime/dev-profile`, на котором работает
// `pnpm dev` (решение владельца 2026-10-06): ручная приёмка начинается с чистого
// старта и не видит ничего, что накопили прогоны, а прогоны — её данных.

import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const repoRoot = join(__dirname, '..', '..', '..', '..')
export const e2eProfileDir = join(repoRoot, 'runtime', 'e2e-profile')
export const PROFILE_PREFIX = 'aecpilot-acceptance-profile-'

/** Что не едет в копию: резервные копии прошлых пинов и журналы — они большие
 *  и к поведению ядра отношения не имеют. Блокировки шлюза (`gateway-locks`) —
 *  состояние запущенного процесса, а не профиля; ядро создаёт папку с правами
 *  только для владельца, и чужому процессу она не читается (замер 2026-10-06).
 *  Базы SQLite едут вместе со своими `-wal`/`-shm`: без них копия базы отстаёт
 *  от живой. */
function skip(entry: string): boolean {
  const name = basename(entry)
  return (
    name.startsWith('.bak-') || name === 'serve.log' || name === 'logs' || name === 'gateway-locks'
  )
}

/** Скопировать профиль автотестов во временную папку и вернуть её путь.
 *
 * `withoutProviderKey` — копия без файла `.env`: ядро поднимается без ключа
 * провайдера, как на машине, где его ещё не вводили (ветка «ключа нет» блока
 * 14). Файл просто не копируется — его содержимое никто не читает. */
export function prepareProfile(options: { withoutProviderKey?: boolean } = {}): string {
  if (!existsSync(join(e2eProfileDir, 'config.yaml'))) {
    throw new Error(`профиль автотестов не найден: ${e2eProfileDir}`)
  }
  const dir = mkdtempSync(join(tmpdir(), PROFILE_PREFIX))
  const envFile = join(e2eProfileDir, '.env')
  cpSync(e2eProfileDir, dir, {
    recursive: true,
    filter: (source) => !skip(source) && !(options.withoutProviderKey && source === envFile)
  })
  copyShippedSkills(dir)
  return dir
}

/** Задача T20.11 (решение владельца 2026-10-16, п. 16). Навыки поставки агент
 *  стенда видит КОПИЕЙ внутри временного профиля, а не папкой `skills/`
 *  репозитория: 2026-10-16 тестовая модель переписала `skills/aec-wiki/SKILL.md`
 *  прямо в git. Копия уходит вместе с профилем; приложению тот же путь
 *  передаётся через `AEC_SKILLS_DIR` (`app.ts`, `register-aec-rag.mjs`). */
export const SHIPPED_SKILLS_COPY = 'aec-shipped-skills'
const repoSkillsDir = join(repoRoot, 'skills')

function copyShippedSkills(profile: string): void {
  const copy = join(profile, SHIPPED_SKILLS_COPY)
  cpSync(repoSkillsDir, copy, { recursive: true, filter: (s) => basename(s) !== '__pycache__' })
  const configPath = join(profile, 'config.yaml')
  const same = (value: string): boolean =>
    resolve(value).toLowerCase() === resolve(repoSkillsDir).toLowerCase()
  const lines = readFileSync(configPath, 'utf-8').split(/\r?\n/)
  const rewritten = lines.map((line) => {
    const item = /^(\s*-\s+)(["']?)(.+?)\2\s*$/.exec(line)
    if (!item) return line
    const value = item[2] === '"' ? item[3].replace(/\\\\/g, '\\') : item[3]
    return same(value) ? `${item[1]}${copy}` : line
  })
  writeFileSync(configPath, rewritten.join('\n'), 'utf-8')
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
