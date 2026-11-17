// Task T71 (owner's remarks 3 and 7 on 0.1.0). The roots every "inside the
// project?" fence compares against: the project folder as written, and the
// same folder after `realpath` when the two differ.
//
// Why both. The fences check a path lexically first and then again after
// `realpath` (a link inside the project leading out must not pass). The second
// check compares a REAL path — and a project reached through a junction, a
// symlink, a substituted drive or an 8.3 short name has a real path that is
// not below the folder as written. Comparing real with written refused every
// file of such a project; `vault-fs.ts` compared real with real and worked,
// which is why the documents opened while the preview and the tree did not.
//
// The real root is resolved on every call, not cached: a project is reopened
// rarely, but a cached root would silently outlive a folder that was moved.
// `realpathSync` on one folder is cheap next to the file read that follows.

import fs from 'node:fs'
import { normalize } from 'node:path'

export function projectFenceRoots(vaultPath: string | undefined): string[] {
  if (!vaultPath) return []
  let real: string
  try {
    real = fs.realpathSync.native(vaultPath)
  } catch {
    return [vaultPath]
  }
  return normalize(real).toLowerCase() === normalize(vaultPath).toLowerCase()
    ? [vaultPath]
    : [vaultPath, real]
}
