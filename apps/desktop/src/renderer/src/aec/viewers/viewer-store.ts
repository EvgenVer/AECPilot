// What the viewer is showing, and how a citation asks it to show something
// (task 2.14).
//
// A store rather than props: the request comes from a link inside an agent's
// answer, which is rendered far away from the pane that has to react to it, and
// threading a callback through their transcript would mean editing their
// transcript.

import { atom } from 'nanostores'

import type { Locator } from '../citations/citation-pure'

export type DocumentRequest = {
  locator: Locator
  relPath: string
  /** Undefined means the vault — the same convention as `readDocument`. */
  sourceId?: string
  /** Bumped on every request so opening the same place twice still scrolls. */
  token: number
}

export const $openDocument = atom<DocumentRequest | null>(null)

let nextToken = 1

export function openDocument(request: Omit<DocumentRequest, 'token'>): void {
  $openDocument.set({ ...request, token: nextToken })
  nextToken += 1
}

export function closeDocument(): void {
  $openDocument.set(null)
}

/** The page a request points at, or 1 — a document with no page in its locator
 *  still opens, at its beginning, because naming the file is already most of
 *  the answer. */
export function requestedPage(request: DocumentRequest | null): number {
  const page = request?.locator.page
  return typeof page === 'number' && page > 0 ? page : 1
}
