// What turning an external channel on actually hands out, and how to notice
// that someone is about to do it (task 3.10, SPEC AC10 / risk R10).
//
// The screen that carries the switch is the donor's, and it enables a platform
// the moment the switch moves — no confirmation, because in their product the
// person flipping it is the person who set the whole thing up. Ours is an
// engineer whose vault holds someone else's project documents, so AC10 requires
// the list of what leaves the machine to be shown BEFORE the channel opens.
//
// The interception point is deliberately not their screen: a dialog wired into
// a vendored file would be a fifth kind of edit, and the next re-copy would
// silently drop it. It sits in our own bridge instead (`hermes-desktop-shim`),
// which every one of their backend calls passes through — so the guard survives
// a re-copy, and it also covers any OTHER surface of theirs that learns to
// enable a channel later.

/** The request their screen sends: `PUT /api/messaging/platforms/<id>` with
 * `{enabled: true}`. Disabling, renaming, or writing credentials goes through
 * the same route and must NOT be interrupted — only opening the door does. */
export function channelBeingEnabled(request: {
  path: string
  method?: string
  body?: unknown
}): null | string {
  if ((request.method ?? 'GET').toUpperCase() !== 'PUT') return null

  const match = /^\/api\/messaging\/platforms\/([^/?#]+)$/.exec(request.path)
  if (!match) return null

  const body = request.body
  if (typeof body !== 'object' || body === null) return null
  if ((body as { enabled?: unknown }).enabled !== true) return null

  return decodeURIComponent(match[1])
}

/** The three consequences R10 names, in the order they matter to the person
 * deciding. Keys, not sentences: the words live in our catalog, and the list
 * being data is what lets a test assert that none of them went missing. */
export const CHANNEL_DISCLOSURE_ITEMS = [
  'channels.disclosure.conversation',
  'channels.disclosure.files',
  'channels.disclosure.remoteStart'
] as const

export type ChannelDisclosureItem = (typeof CHANNEL_DISCLOSURE_ITEMS)[number]
