// `window.hermesDesktop` — the donor's preload bridge, reimplemented over ours.
//
// Their renderer reaches the backend through two globals: their gateway client
// (replaced by `gateway-bridge`) and this one, which carries REST, the backend
// pool and a set of native affordances. Providing it means their vendored files
// keep their own `window.hermesDesktop.…` lines instead of being edited.
//
// The TYPE is theirs — `donor/global.d.ts`, vendored — so their contract stays
// authoritative and tsc keeps using it to check their code. What is ours is the
// IMPLEMENTATION, and it is deliberately partial: everything not in
// `IMPLEMENTED` below rejects by name instead of silently doing nothing. A
// screen that needs one more member is a task that wires it (the explorer's
// file operations at 1.8.17, profiles at 1.8.11), not a reason to fake it here.
//
// One capability is refused on purpose rather than implemented:
//   api({upload}) — multipart upload has no IPC counterpart; attachments go
//     through our own `pickAttachments` / `pasteAttachment` channels.
//
// And one answers without granting anything: `getConnection` hands back a
// descriptor that names the IPC bridge and carries no credential, because the
// gateway's real URL and token are exactly what SPEC C9 keeps out of the
// renderer. Callers must therefore not read that descriptor as "a socket can be
// opened to this" — `donor/lib/voice-playback.ts` did, and its speech stream
// went from "unavailable, fall back" to "throws" (task 3.7a).

import { gatewayBridge } from './gateway-bridge'

type HermesDesktop = Window['hermesDesktop']

const REST_METHODS = ['GET', 'POST', 'PUT', 'DELETE']

/** The members our main process actually serves today. Typed loosely on
 * purpose: their contract is wide and precise (90-odd members), ours is a
 * hand-picked subset, and pretending the subset satisfies the whole interface
 * would need a cast per member instead of the one at the proxy below. */
const IMPLEMENTED: Record<string, unknown> = {
  api<T>(request: {
    path: string
    method?: string
    body?: unknown
    upload?: unknown
    timeoutMs?: number
  }): Promise<T> {
    if (request.upload) {
      return Promise.reject(new Error('hermesDesktop.api: uploads are not bridged'))
    }

    const method = (request.method ?? 'GET').toUpperCase()
    if (!REST_METHODS.includes(method)) {
      return Promise.reject(new Error(`hermesDesktop.api: unsupported method ${method}`))
    }

    return gatewayBridge().rest<T>(request.path, {
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE',
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs })
    })
  },

  // Their boot flow asks for a connection descriptor, builds a ws:// URL from
  // it and hands that to the client's `connect()`. Ours ignores the URL — main
  // owns the socket — so the honest answer is a descriptor that names the IPC
  // bridge and carries NO credential. Nothing dials it: their REST goes through
  // `api` below, their plugin socket is removed, and voice is not bridged.
  getConnection(profile?: null | string): Promise<unknown> {
    return Promise.resolve({
      authMode: 'token',
      baseUrl: 'ipc://main',
      profile: profile ?? null,
      token: '',
      wsUrl: 'ws://ipc/api/ws'
    })
  },

  // No pool to keep warm: one backend, owned by main, alive for as long as the
  // app is. Resolving true is the truthful answer to "is it still there".
  touchBackend(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true })
  },

  // Task 3.7a. Their recorder asks before opening capture and reads `false` as
  // "denied"; the unbridged stand-in would REJECT here, and an `await` on a
  // rejection is a throw, not a `false` — which is why pressing the microphone
  // button raised their `recordingFailed` notice instead of recording.
  requestMicrophoneAccess(): Promise<boolean> {
    return window.aecpilot.requestMicrophoneAccess()
  },

  profile: {
    set(name: string) {
      return window.aecpilot.useProfile(name)
    }
  }
}

/** Everything else answers with its own name, so an unwired capability shows up
 * as one readable failure instead of `undefined is not a function`.
 *
 * Their bridge has three member shapes, and the stand-in has to answer in kind
 * or their code breaks on the SHAPE rather than on the missing capability —
 * both of the first boot's crashes were exactly that:
 *   method        `getVersion()`         → a rejected promise, named
 *   subscription  `onFoundInPage(cb)`    → a DISPOSER; a promise here tore the
 *                                          app down with "detachListener is
 *                                          not a function"
 *   namespace     `zoom.get()`,          → an object whose members are again
 *                 `zoom.onChanged(cb)`     one of these three
 * So the stand-in is a callable proxy that reproduces itself on property
 * access, with `then` deliberately absent — an accidental thenable would make
 * every `await` on it hang. */
const SUBSCRIPTION = /^on[A-Z]/

function unbridged(path: string): unknown {
  const member = path.slice(path.lastIndexOf('.') + 1)

  const call = SUBSCRIPTION.test(member)
    ? () => () => {}
    : () => Promise.reject(new Error(`window.hermesDesktop.${path} is not bridged in AECPilot`))

  return new Proxy(call, {
    get(_target, property) {
      // Never look like a promise, an iterable or a primitive.
      if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
        return undefined
      }
      return unbridged(`${path}.${String(property)}`)
    }
  })
}

export function createHermesDesktopBridge(): HermesDesktop {
  const proxy = new Proxy(IMPLEMENTED, {
    get(target, property: string) {
      if (property in target) return target[property]
      return unbridged(property)
    },
    has() {
      return true
    }
  })

  return proxy as unknown as HermesDesktop
}

/** Installs the bridge on `window`. Called once, before React mounts. */
export function installHermesDesktopBridge(): void {
  window.hermesDesktop = createHermesDesktopBridge()
}
