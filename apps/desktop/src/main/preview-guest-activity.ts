// Preview guest activity (task T52, donor 0.23.0): the window asks main to wake
// its preview `<webview>` for a moment and to run a script in the LOADED
// document of that guest. Their preview pane reads the page for the agent
// (`read_preview`), drives it (`drive_preview`) and annotates it only through
// this lease since 0.23.0 — without it those tools refuse.
//
// Adapted from Hermes Desktop (MIT) `apps/desktop/electron/preview-guest-throttle.ts`
// at caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3). Changes: their
// `applyPreviewGuestAttachPrefs` keeps only the admission of the jar
// (`admitPreviewGuestPartition`) — the guest preload it also sets is one we do not
// ship — and their window-pool `holdWindow` is replaced by `holdOwnerAwake` below —
// we have no pool, only the window's own background throttling.
//
// Since 0.23.3 their preview pane gives every profile but the default its own
// cookie jar (`previewPartitionForProfile` in the donor's `preview-guest-throttle.ts`), so the guest's session is no longer
// always the default one (task T86).
//
// Trust: the renderer could already call `webview.executeJavaScript` on its own
// guest, so the script door adds no capability; main still checks that the
// guest is a `webview` hosted by the asking window in an admitted preview jar.

import type { Session, WebContents } from 'electron'

/** The launch/default preview jar; every other profile rides a sibling of it. */
export const PREVIEW_GUEST_PARTITION = 'persist:hermes-preview'

/** The default jar and its per-profile siblings, and nothing else. */
export function isPreviewPartition(partition: string | undefined): boolean {
  return (
    partition === PREVIEW_GUEST_PARTITION ||
    (typeof partition === 'string' && partition.startsWith(`${PREVIEW_GUEST_PARTITION}-`))
  )
}

// Every preview-family session a window has attached a guest in. Electron gives a
// Session no partition name, so the jar is remembered by identity when the guest
// attaches (`session.fromPartition` is memoized).
const previewGuestSessions = new WeakSet<Session>()

/** Called from `will-attach-webview`: remembers the guest's jar when it is a preview one. */
export function admitPreviewGuestPartition(
  partition: string | undefined,
  resolveSession: (partition: string) => Session
): void {
  if (partition && isPreviewPartition(partition)) {
    previewGuestSessions.add(resolveSession(partition))
  }
}

export function isPreviewGuestSession(session: Session | undefined): boolean {
  return Boolean(session && previewGuestSessions.has(session))
}

let nextLease = 0

const leases = new Map<
  number,
  {
    owner: WebContents
    guest: WebContents
    release: () => void
    cancelled: AbortController
  }
>()

const activeGuests = new WeakMap<WebContents, Set<number>>()

/**
 * Only the embedding window can temporarily wake its preview guest. Scripts
 * may await rAF (including user-approved plugin scripts), but keeping that
 * exemption for the guest's lifetime also keeps the containing window painting.
 * No deadline here: each caller owns its existing timeout/cancellation policy.
 */
export function beginPreviewGuestActivity(
  owner: WebContents,
  guest: undefined | WebContents,
  holdOwner: () => () => void
): number {
  if (
    owner.isDestroyed() ||
    owner.getType() !== 'window' ||
    !guest ||
    guest.isDestroyed() ||
    guest.getType() !== 'webview' ||
    guest.hostWebContents !== owner ||
    !isPreviewGuestSession(guest.session)
  ) {
    throw new Error('Preview guest does not belong to this window')
  }

  let tokens = activeGuests.get(guest)

  if (!tokens) {
    tokens = new Set()
    activeGuests.set(guest, tokens)
  }

  const token = ++nextLease
  const group = tokens
  const original = guest.getBackgroundThrottling()

  // Only the first lease owns lifecycle listeners and restoration. Later
  // leases reuse its release function, so finishing one cannot suspend another.
  let release = group.size ? leases.get(group.values().next().value!)!.release : undefined

  if (!release) {
    // Guest frames alone do not wake the host's typing/scroll timers.
    // The shared window controller must arbitrate this with live chat work.
    const releaseOwner = holdOwner()

    // A new document can replace the hidden widget while the stored flag stays
    // false. Lease-only work (input/capture) must wake it without another script.
    const wake = () => guest.setBackgroundThrottling(false)

    const restore = () => {
      if (group.size) {
        return
      }

      activeGuests.delete(guest)
      guest.removeListener('destroyed', discard)
      guest.removeListener('render-process-gone', discard)
      guest.removeListener('did-navigate', wake)
      owner.removeListener('destroyed', discard)
      owner.removeListener('render-process-gone', discard)
      owner.removeListener('did-navigate', discard)

      try {
        if (!guest.isDestroyed()) {
          guest.setBackgroundThrottling(original)
        }
      } finally {
        releaseOwner()
      }
    }

    const discard = () => {
      for (const id of group) {
        leases.get(id)?.cancelled.abort(new Error('Preview guest is unavailable'))
        leases.delete(id)
      }

      group.clear()
      restore()
    }

    release = restore
    guest.once('destroyed', discard)
    guest.once('render-process-gone', discard)
    guest.on('did-navigate', wake)
    owner.once('destroyed', discard)
    owner.once('render-process-gone', discard)
    owner.on('did-navigate', discard)

    try {
      guest.setBackgroundThrottling(false)
    } catch (error) {
      discard()
      throw error
    }
  }

  group.add(token)
  leases.set(token, { owner, guest, release, cancelled: new AbortController() })

  return token
}

export function endPreviewGuestActivity(owner: WebContents, token: number): void {
  const lease = leases.get(token)

  if (!lease || lease.owner !== owner || lease.guest.hostWebContents !== owner) {
    return
  }

  leases.delete(token)
  activeGuests.get(lease.guest)?.delete(token)
  lease.cancelled.abort(new Error('Preview activity ended'))
  lease.release()
}

/** Dispatch in the loaded document, not through executeJavaScript's hidden
 * navigation queue. Old-document promises need explicit cancellation: Electron
 * does not guarantee they settle when that document disappears. */
export async function executePreviewGuestScript(
  owner: WebContents,
  token: number,
  code: string
): Promise<unknown> {
  const lease = leases.get(token)

  if (!lease || lease.owner !== owner || lease.guest.hostWebContents !== owner) {
    throw new Error('Preview activity does not belong to this window')
  }

  const { guest, cancelled } = lease
  const { signal } = cancelled
  let abort!: () => void
  let loaded: (() => void) | undefined
  let navigated: (() => void) | undefined

  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
  })

  try {
    signal.throwIfAborted()

    if (!guest.getURL() || guest.isLoadingMainFrame()) {
      const ready = new Promise<void>((resolve) => {
        loaded = resolve
        guest.once('did-stop-loading', loaded)
      })

      await Promise.race([ready, interrupted])
    }

    signal.throwIfAborted()
    navigated = () => cancelled.abort(new Error('Preview page navigated'))
    guest.once('did-navigate', navigated)
    // Backstop for a lease acquired during loading: reapply once the document
    // is ready, even if its navigation committed before the lease was acquired.
    guest.setBackgroundThrottling(false)

    // Readiness and dispatch share this main-process turn. Keep the existing
    // structured-clone result contract; mainFrame.executeJavaScript converts
    // values such as Maps, Dates, typed arrays and undefined to JSON-like values.
    return await Promise.race([guest.executeJavaScript(code), interrupted])
  } finally {
    signal.removeEventListener('abort', abort)

    if (loaded) {
      guest.removeListener('did-stop-loading', loaded)
    }

    if (navigated) {
      guest.removeListener('did-navigate', navigated)
    }

    endPreviewGuestActivity(owner, token)
  }
}

const ownerHolds = new WeakMap<WebContents, { count: number; original: boolean }>()

/** Keep the owning window's timers running while any lease of it is live;
 * the last release restores what the window had before the first hold. */
export function holdOwnerAwake(owner: WebContents): () => void {
  let hold = ownerHolds.get(owner)
  if (!hold) {
    hold = { count: 0, original: owner.getBackgroundThrottling() }
    ownerHolds.set(owner, hold)
    owner.setBackgroundThrottling(false)
  }
  hold.count += 1
  let released = false
  return () => {
    if (released) return
    released = true
    const current = ownerHolds.get(owner)
    if (!current) return
    current.count -= 1
    if (current.count > 0) return
    ownerHolds.delete(owner)
    if (!owner.isDestroyed()) owner.setBackgroundThrottling(current.original)
  }
}

/** Task T88 (review debt): a deleted or renamed profile leaves its preview cookie jar behind,
 * and a profile created later under the same name would open the sites still signed in. Their
 * delete/rename hooks (`dropPreviewSigninsForProfile`, `migratePreviewSigninsForProfile`) clear
 * only the cookies imported from a real browser profile (HX36, not taken); here the whole jar
 * of that profile is cleared — the sign-ins a person made by hand in the preview included. The
 * default profile's jar is never cleared this way (that profile cannot be deleted). */
export async function clearPreviewJarForProfile(
  profile: string,
  partitionFor: (profile: string) => string,
  resolveSession: (partition: string) => Session
): Promise<boolean> {
  const partition = partitionFor(profile)
  if (partition === PREVIEW_GUEST_PARTITION || !isPreviewPartition(partition)) return false
  const jar = resolveSession(partition)
  await jar.clearStorageData()
  await jar.clearCache()
  return true
}
