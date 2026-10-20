// Задача T31 (SPEC UR25, решения владельца 2026-08-17 и 2026-10-16). Один дистрибутив,
// три режима установки: «всё на этой машине», «только сервер», «только приложение».
// Установщик записывает режим одним словом в `<root>/install-mode.txt`
// (`runtime/hermes-env.mjs::readInstallMode` читает тот же файл).
//
// РОЛЬ ПРОЦЕССА — не то же, что режим установки:
// - `server` — ядро на этой машине, окна нет, только значок в трее; так запускается
//   установка «только сервер» и любая установка с ключом `--server` (задача Windows
//   при входе в систему, T32);
// - `client` — ядра на диске нет, приложение — окно к ядру на сервере;
// - `full` — как до T31: своё ядро и окно.

export type InstallMode = 'full' | 'server' | 'client'
export type AppRole = InstallMode

const MODES: readonly InstallMode[] = ['full', 'server', 'client']

export const SERVER_SWITCH = '--server'

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`)

export function parseInstallMode(text: string | null | undefined): InstallMode | null {
  if (typeof text !== 'string') return null
  const word = text.replace(BOM, '').trim().toLowerCase()
  return (MODES as readonly string[]).includes(word) ? (word as InstallMode) : null
}

/** Роль этого запуска. В клиентской установке ядра нет, и `--server` поднять его
 *  не может — роль остаётся клиентской, а не падает на старте. */
export function appRole(mode: InstallMode | null, argv: readonly string[]): AppRole {
  if (mode === 'client') return 'client'
  if (mode === 'server' || argv.includes(SERVER_SWITCH)) return 'server'
  return 'full'
}
