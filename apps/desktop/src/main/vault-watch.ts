// Task T74 (UR56, owner's remark 2 on 0.1.0): files the agent creates or
// changes in the project show up on their own — the vault tree and an open
// document refresh without a click.
//
// ONE recursive watcher on the vault folder (`fs.watch` recursive is native on
// Windows and macOS). Events are coalesced over a short window: an editor or
// the agent saves by writing a temp file and renaming it, and a burst of five
// events for one save must reach the window as one change.
//
// `.aecpilot/` is ignored: the index database and logs live there and change
// constantly while indexing — none of it is a file a person looks at in the
// tree, and refreshing on every SQLite page write would burn the window.

import fs from 'node:fs'

export const VAULT_CHANGE_DEBOUNCE_MS = 300

/** Whether a vault-relative path (with `/`) is worth telling the window about. */
export function isWatchedVaultPath(rel: string): boolean {
  if (rel === '') return false
  const first = rel.split('/')[0].toLowerCase()
  return first !== '.aecpilot' && first !== '.git' && first !== 'node_modules'
}

export type VaultWatch = { close: () => void }

/** Starts watching `vaultPath`; `onChange` receives the changed vault-relative
 *  paths (with `/`), deduplicated, at most once per debounce window. A watcher
 *  that cannot start (folder gone, no permission) returns a no-op: live refresh
 *  is a convenience, and its absence must not break opening a project. */
export function startVaultWatch(
  vaultPath: string,
  onChange: (paths: string[]) => void,
  debounceMs = VAULT_CHANGE_DEBOUNCE_MS
): VaultWatch {
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const flush = (): void => {
    timer = null
    if (closed || pending.size === 0) return
    const paths = [...pending]
    pending.clear()
    onChange(paths)
  }

  let watcher: fs.FSWatcher
  try {
    watcher = fs.watch(vaultPath, { persistent: false, recursive: true }, (_event, name) => {
      // An event without a name is "something in the folder changed": report
      // the root, so the window re-reads the tree.
      const rel = name ? String(name).replace(/\\/g, '/') : '.'
      if (rel !== '.' && !isWatchedVaultPath(rel)) return
      pending.add(rel)
      if (!timer) timer = setTimeout(flush, debounceMs)
    })
  } catch {
    return { close: () => undefined }
  }
  watcher.on('error', () => {
    // The vault folder was removed or became unreachable; the project switch
    // that follows closes this watcher.
  })

  return {
    close: () => {
      closed = true
      if (timer) clearTimeout(timer)
      watcher.close()
    }
  }
}
