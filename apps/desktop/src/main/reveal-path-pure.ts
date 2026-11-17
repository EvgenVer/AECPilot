// Task T72 (owner's remark 4 on 0.1.0): «Открыть содержащую папку» on the card
// of a file the agent made. Their card calls the `revealPath` bridge member,
// which we had left unbridged — the button answered "not on this computer".
//
// THE FENCE. Showing a file in Explorer reads nothing, but it is still the
// main process acting on a path a language model wrote. So the rule is the one
// the preview keeps, widened by exactly what the person connected: a file
// inside the open project or inside one of its source folders. Anything else
// is refused in words, not silently ignored.
//
// Pure: no disk, no electron. The handler adds `realpath` and `stat`.

import { isInside, resolveArtifactPath, type ProjectRoots } from './artifact-files-pure'
import { mainT } from './i18n'

export function revealOutsideError(): string {
  return mainT('reveal.outside')
}

export type RevealDecision = { ok: true; absPath: string } | { ok: false; error: string }

/** May Explorer be opened on the path the window named?
 *
 * `projectRoots` — the project folder (as written and real, `project-fence.ts`);
 * relative paths resolve against it. `sourceRoots` — the connected source
 * folders, also as written and real. */
export function decideReveal(
  projectRoots: ProjectRoots,
  sourceRoots: readonly string[],
  value: unknown
): RevealDecision {
  const resolved = resolveArtifactPath(projectRoots, value)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  if (!revealAllowed(projectRoots, sourceRoots, resolved.absPath)) {
    return { ok: false, error: revealOutsideError() }
  }
  return { ok: true, absPath: resolved.absPath }
}

/** The same fence for a path after `realpath`: a link inside the project that
 * leads out must not open Explorer on a foreign folder. */
export function revealAllowed(
  projectRoots: ProjectRoots,
  sourceRoots: readonly string[],
  absPath: string
): boolean {
  return isInside(projectRoots, absPath) || isInside(sourceRoots, absPath)
}
