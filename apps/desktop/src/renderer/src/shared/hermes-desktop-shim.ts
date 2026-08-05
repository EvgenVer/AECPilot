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
// Two capabilities are refused on purpose rather than implemented:
//   getConnection — would hand the renderer the gateway's URL and token, which
//     SPEC C9 forbids. Their per-profile socket pool is the only caller and it
//     treats the rejection as a transport failure, which is the honest outcome:
//     main owns one connection and does not lend it out.
//   api({upload}) — multipart upload has no IPC counterpart; attachments go
//     through our own `pickAttachments` / `pasteAttachment` channels.

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

  getConnection(): Promise<never> {
    return Promise.reject(new Error('the gateway connection stays in the main process (SPEC C9)'))
  },

  // No pool to keep warm: one backend, owned by main, alive for as long as the
  // app is. Resolving true is the truthful answer to "is it still there".
  touchBackend(): Promise<{ ok: boolean }> {
    return Promise.resolve({ ok: true })
  },

  profile: {
    set(name: string) {
      return window.aecpilot.useProfile(name)
    }
  }
}

/** Everything else answers with its own name, so an unwired capability shows up
 * as one readable failure instead of `undefined is not a function`. */
function notBridged(member: string): () => Promise<never> {
  return () =>
    Promise.reject(new Error(`window.hermesDesktop.${member} is not bridged in AECPilot`))
}

export function createHermesDesktopBridge(): HermesDesktop {
  const proxy = new Proxy(IMPLEMENTED, {
    get(target, property: string) {
      if (property in target) return target[property]
      return notBridged(property)
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
