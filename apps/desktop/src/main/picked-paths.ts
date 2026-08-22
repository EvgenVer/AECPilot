// Task 4D-11. `project:create` used to take whatever absolute path the window
// sent it. The window is where somebody else's documents get rendered, so
// "the renderer said so" is not a good enough reason to create a directory
// tree somewhere on the user's disk. Overwriting an existing file was already
// impossible by construction; making an empty tree anywhere writable was not.
//
// The fix is not a stricter path check — any check that tries to guess which
// directories are "allowed" guesses wrong. It is a different question: did a
// human actually choose this folder in a native dialog? Main knows, because
// main is what opened the dialog. So main remembers what it handed out, and
// refuses a path it never showed anyone.

import { resolve } from 'node:path'

/** Enough for a session's worth of picking and re-picking, small enough that
 * a renderer spamming the dialog can't grow it without bound. Oldest entries
 * fall off — a folder picked and abandoned twenty dialogs ago is not the one
 * being created. */
const MAX_REMEMBERED = 16

const picked: string[] = []

/** Windows paths differ only by case surprisingly often (`C:\Users` vs
 * `c:\users`) — the dialog's spelling and the renderer's round-trip need not
 * match byte for byte. Everywhere else, case is meaningful. */
function normalize(p: string): string {
  const abs = resolve(p)
  return process.platform === 'win32' ? abs.toLowerCase() : abs
}

/** Records a path a native dialog just handed to the user.
 *
 * Задача 3.13b: тот же список теперь хранит и ФАЙЛЫ. Причина та же самая —
 * человек выбрал их в диалоге, который открыл главный процесс, — а нужда новая:
 * при удалённом ядре вложение уезжает БАЙТАМИ (путь этой машины там ничего не
 * значит), и чтобы их прочитать, главному процессу надо знать, что этот файл
 * показал человеку он сам. */
export function rememberPickedPath(dirPath: string): void {
  const key = normalize(dirPath)
  const at = picked.indexOf(key)
  if (at !== -1) picked.splice(at, 1)
  picked.push(key)
  if (picked.length > MAX_REMEMBERED) picked.shift()
}

/** Whether `dirPath` is a path this process showed a human in a dialog. */
export function wasPickedByUser(dirPath: string): boolean {
  return picked.includes(normalize(dirPath))
}

/** Tests only: the list is process-global by design (it mirrors what the user
 * did in this run of the app), so a test that fills it has to empty it. */
export function forgetPickedPaths(): void {
  picked.length = 0
}
