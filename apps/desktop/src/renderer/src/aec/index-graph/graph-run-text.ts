// What the graph run says while it goes (task 3M.4, acceptance 46.7.2). Per
// document only, a document of 495 chunks stood at «0 из 1» for a quarter of an
// hour; inside a document `aec-rag` now reports each chunk and the entities
// extracted so far.

import type { GraphRunStopped, IngestProgressEvent } from '../../../../shared/ipc'

/** A run the person stopped (task 3M.5): what is done, and which document
 *  will be built again. */
export function graphStoppedText(
  t: (key: string, ...args: unknown[]) => string,
  stopped: GraphRunStopped
): string {
  const done = t('graphAdd.stopped', stopped.done, stopped.total)
  if (!stopped.interrupted) return done
  const name = stopped.interrupted.split('/').pop() ?? stopped.interrupted
  return `${done} ${t('graphAdd.stoppedDocument', name)}`
}

export function graphRunText(
  t: (key: string, ...args: unknown[]) => string,
  progress: IngestProgressEvent | null | undefined
): string {
  const done = progress?.done ?? 0
  const total = progress?.total ?? 0
  if (progress?.stage === 'extracting' && progress.chunk) {
    return t(
      'graphAdd.runningChunk',
      done + 1,
      total,
      progress.chunk,
      progress.chunks,
      progress.entities ?? 0
    )
  }
  return t('graphAdd.running', done, total)
}
