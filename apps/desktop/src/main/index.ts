import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ChildProcess } from 'node:child_process'
import { GatewayClient } from '../shared/gateway/client'
import type { GatewayConnectionState, GatewayEvent } from '../shared/gateway/types'

interface ServeHandle {
  proc: ChildProcess
  port: number
  host: string
  wsUrl: string
  token: string
}

interface ServeModule {
  startServe: (opts?: { port?: number; host?: string }) => Promise<ServeHandle>
  waitHealthy: (handle: ServeHandle, timeoutMs?: number) => Promise<unknown>
  stopServe: (handle: ServeHandle, opts?: { gracefulTimeoutMs?: number }) => Promise<void>
}

// runtime/serve.mjs resolves its own paths (HERMES_BIN, HERMES_HOME_DIR, …)
// relative to its own file location, which only works if it keeps living at
// runtime/serve.mjs on disk — a static `import` would let electron-vite
// inline its source into out/main/index.js, breaking that resolution. The
// runtime-computed specifier (built from __dirname, not a literal string)
// keeps this a real dynamic import that Rollup can't inline.
// TODO(Phase 5 / task 5.1): __dirname will live inside app.asar in the
// packaged app — this relative path to runtime/serve.mjs must be revisited
// for the bundled layout.
async function loadServeModule(): Promise<ServeModule> {
  const specifier = pathToFileURL(join(__dirname, '../../../../runtime/serve.mjs')).href
  return (await import(/* @vite-ignore */ specifier)) as ServeModule
}

let serveHandle: ServeHandle | undefined
let stopServeFn: ServeModule['stopServe'] | undefined
let gateway: GatewayClient | undefined
let sessionId: string | undefined
let ensureSessionPromise: Promise<string> | undefined
// Mirrors the gateway's connection state so a freshly-loaded renderer can pull
// the current value on mount (see `gateway:get-state`). The initial 'ready'
// fires while no window exists to receive the push, so a push-only channel
// would leave the renderer stuck at 'closed'.
let gatewayState: GatewayConnectionState = 'closed'

/** Wires a `GatewayClient` for `url` into the app: forwards events/state to
 * every window and attempts the initial connect (tolerating failure — the
 * window still opens, chat just won't be able to connect yet). Shared by the
 * normal `hermes serve` startup path and the `AEC_GATEWAY_URL` e2e override
 * (task 0.16), which points this at a mock gateway instead of spawning
 * `hermes serve`. */
async function connectGateway(url: string): Promise<void> {
  gateway = new GatewayClient({ url })
  gateway.onEvent((event: GatewayEvent) => {
    // Only forward events for the active session, plus session-less
    // events (e.g. `gateway.ready`, which carries no session_id).
    if (event.session_id && event.session_id !== sessionId) return
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('chat:event', event)
  })
  gateway.onStateChange((state) => {
    gatewayState = state
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gateway:state', state)
  })

  try {
    await gateway.connect()
  } catch (error: unknown) {
    // Same tolerance as a serve-start failure — the window still
    // opens, the chat just won't be able to connect yet.
    console.error('aecpilot: gateway connect FAIL', error)
  }
}

/** Lazily creates the single implicit chat session (task 0.11 — no sessions
 * list yet, see task 0.14) and caches its id. Concurrent callers await the
 * same in-flight creation rather than racing separate `session.create`
 * calls. */
async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId
  if (!gateway) throw new Error('cannot create a chat session — gateway is not connected')
  if (!ensureSessionPromise) {
    ensureSessionPromise = gateway
      .request('session.create', {
        source: 'aecpilot-desktop'
        // TODO(Phase 1): cwd = vault root
      })
      .then((result) => {
        sessionId = result.session_id
        return sessionId
      })
      .finally(() => {
        ensureSessionPromise = undefined
      })
  }
  return ensureSessionPromise
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: process.env.AEC_SMOKE !== '1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.AEC_SMOKE === '1') {
    win.webContents.once('did-finish-load', () => {
      console.log('aecpilot: smoke ok')
      app.quit()
    })
    win.webContents.once('did-fail-load', (_event, _errorCode, errorDescription) => {
      console.error(`aecpilot: smoke FAIL ${errorDescription}`)
      process.exitCode = 1
      app.quit()
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('chat:submit', async (_event, text: string) => {
  const activeSessionId = await ensureSession()
  if (!gateway) throw new Error('cannot submit prompt — gateway is not connected')
  await gateway.request('prompt.submit', { session_id: activeSessionId, text })
})

ipcMain.handle('gateway:get-state', () => gatewayState)

app
  .whenReady()
  .then(async () => {
    // AEC_SMOKE: fast UI-only smoke test — skip the hermes backend entirely.
    if (process.env.AEC_SMOKE !== '1') {
      // AEC_GATEWAY_URL (task 0.16, Playwright e2e): point the gateway
      // client at a pre-started server (a mock gateway in tests) instead of
      // spawning `hermes serve`. serveHandle/stopServeFn stay undefined in
      // this mode — existing shutdown guards already tolerate that.
      if (process.env.AEC_GATEWAY_URL) {
        console.warn('aecpilot: AEC_GATEWAY_URL override active — skipping hermes serve')
        await connectGateway(process.env.AEC_GATEWAY_URL)
      } else {
        try {
          const { startServe, waitHealthy, stopServe } = await loadServeModule()
          serveHandle = await startServe()
          stopServeFn = stopServe

          // startServe only spawns the process — the gateway WS endpoint isn't
          // accepting connections yet. Wait until it's healthy before connecting:
          // GatewayClient does not retry a failed *initial* connect (auto-reconnect
          // only engages after the first successful 'ready'), so connecting too
          // early leaves the app permanently disconnected.
          await waitHealthy(serveHandle, 30000)

          // SECURITY: serveHandle.wsUrl embeds the gateway auth token
          // (?token=…). It stays in the main process only — never send it over
          // IPC and never log this url or any error that could carry it. The
          // `gateway connect FAIL` log inside connectGateway is safe only
          // because GatewayClient errors do not include the url; keep that
          // invariant if you touch it.
          await connectGateway(serveHandle.wsUrl)
        } catch (error: unknown) {
          // Backend failing to start must not take the window down — the chat
          // just won't be able to connect yet (see task 0.8).
          console.error('aecpilot: hermes serve start FAIL', error)
        }
      }
    }

    createWindow()
    console.log('aecpilot: window created')

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('aecpilot: startup FAIL', error)
    process.exitCode = 1
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let quitting = false

app.on('before-quit', (event) => {
  if (quitting || !serveHandle || !stopServeFn) return
  event.preventDefault()
  quitting = true
  const handle = serveHandle
  serveHandle = undefined
  stopServeFn(handle)
    .catch(() => {})
    .finally(() => app.quit())
})
