// What the graph run says while it goes (task 3M.4, acceptance 46.7.2). Per
// document only, a document of 495 chunks stood at «0 из 1» for a quarter of an
// hour; inside a document `aec-rag` now reports each chunk and the entities
// extracted so far.

import type { IngestProgressEvent } from '../../../../shared/ipc'

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
