// Why the rollback screen can show an empty list even though the agent has
// been editing files (task 1.6.C2, specs/checkpoints-rollback.md Open
// questions №1).
//
// hermes decides WHICH directory a snapshot covers per edited file, with
// `CheckpointManager.get_working_dir_for_path` (tools/checkpoint_manager.py):
// it walks UP from the file's folder looking for one of nine hard-coded
// markers and snapshots the first directory that has one; with no marker
// anywhere it snapshots the file's own folder. Our `rollback.list/diff/
// restore` calls, in contrast, always address the SESSION's cwd — the vault
// root — because the gateway takes no directory parameter
// (`_with_checkpoints`, tui_gateway/server.py:4492).
//
// So the two only line up when the vault root itself carries a marker. This
// module reproduces that walk over the vault root so the screen can name the
// reason instead of showing a bare empty list. It is a diagnosis, not a
// guarantee: it answers "would a snapshot taken for the vault root be filed
// under the vault root", which is the question that makes the list empty in
// practice.
//
// Whether to place a marker in the vault root is the OWNER's decision and is
// not taken here (TASKS.md 1.6.C1).

/** The nine markers, verbatim from `get_working_dir_for_path`. */
export const CHECKPOINT_MARKERS = [
  '.git',
  'pyproject.toml',
  'package.json',
  'Cargo.toml',
  'go.mod',
  'Makefile',
  'pom.xml',
  '.hg',
  'Gemfile'
] as const

export type CheckpointScope =
  /** A marker sits in the vault root: snapshots of vault files are filed
   * under the same directory the screen asks about — the list is truthful. */
  | { kind: 'vault' }
  /** The nearest marker is ABOVE the vault. Snapshots go to that ancestor's
   * id, so `rollback.list` on the vault root stays empty. */
  | { kind: 'ancestor'; dir: string }
  /** The nearest marker is the user's home directory — hermes's own "too
   * broad" guard (`ensure_checkpoint`: `if abs_dir in {"/", str(Path.home())}`)
   * then refuses the snapshot entirely, silently. Nothing is ever recorded. */
  | { kind: 'blocked'; dir: string }
  /** No marker anywhere up to the drive root: every edited file is snapshotted
   * under its OWN folder, so only edits directly in the vault root can ever
   * show up in this list. */
  | { kind: 'unmarked' }

/** Case-insensitive, trailing-separator-tolerant path equality. Windows is the
 * target platform and `os.homedir()` / a stored vault path routinely differ in
 * drive-letter case; a false "different directory" here would produce a wrong
 * explanation on screen, which is worse than a rare false match elsewhere. */
function samePath(a: string, b: string): boolean {
  const strip = (p: string): string => p.replace(/[/\\]+$/, '').toLowerCase()
  return strip(a) === strip(b)
}

/** Mirrors `get_working_dir_for_path`'s upward walk starting at `vaultPath`.
 *
 * `hasMarker`/`parentOf` are injected so this stays a pure function over the
 * filesystem shape; `parentOf` must return its argument unchanged at the root,
 * which is how the python loop (`while check != check.parent`) terminates —
 * note that the root itself is therefore never tested for a marker, and this
 * reproduces that.
 */
export function resolveCheckpointScope(
  vaultPath: string,
  homeDir: string,
  hasMarker: (dir: string) => boolean,
  parentOf: (dir: string) => string
): CheckpointScope {
  let check = vaultPath
  for (;;) {
    const parent = parentOf(check)
    if (samePath(parent, check)) return { kind: 'unmarked' }
    if (hasMarker(check)) {
      if (samePath(check, vaultPath)) return { kind: 'vault' }
      if (samePath(check, homeDir)) return { kind: 'blocked', dir: check }
      return { kind: 'ancestor', dir: check }
    }
    check = parent
  }
}
