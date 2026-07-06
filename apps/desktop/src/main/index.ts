import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ChildProcess } from 'node:child_process'

interface ServeHandle {
  proc: ChildProcess
  port: number
  host: string
  wsUrl: string
  token: string
}

interface ServeModule {
  startServe: (opts?: { port?: number; host?: string }) => Promise<ServeHandle>
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

app
  .whenReady()
  .then(async () => {
    // AEC_SMOKE: fast UI-only smoke test — skip the hermes backend entirely.
    if (process.env.AEC_SMOKE !== '1') {
      try {
        const { startServe, stopServe } = await loadServeModule()
        serveHandle = await startServe()
        stopServeFn = stopServe
      } catch (error: unknown) {
        // Backend failing to start must not take the window down — the chat
        // just won't be able to connect yet (see task 0.8).
        console.error('aecpilot: hermes serve start FAIL', error)
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
