import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ChildProcess } from 'node:child_process'
import { GatewayClient } from '../shared/gateway/client'
import type { GatewayConnectionState, GatewayEvent } from '../shared/gateway/types'
import {
  encryptKey,
  getDecryptedKey,
  isEncryptionAvailable,
  keyEnvVarStatus,
  loadLlmSettings,
  PROVIDER_API_KEY_ENV_VAR,
  saveLlmSettings
} from './llm-settings'
import {
  isApprovalMode,
  mergeApprovalsModeIntoConfigYaml,
  mergeModelIntoConfigYaml,
  parseApprovalsMode,
  validateSaveLlmSettingsPayload
} from './llm-settings-pure'
import { createProject, type OpenProject } from './project-manager'
import { loadRecents, recordRecent } from './recents'

interface ServeHandle {
  proc: ChildProcess
  port: number
  host: string
  wsUrl: string
  token: string
}

interface ServeModule {
  startServe: (opts?: {
    port?: number
    host?: string
    extraEnv?: Record<string, string>
  }) => Promise<ServeHandle>
  waitHealthy: (handle: ServeHandle, timeoutMs?: number) => Promise<unknown>
  stopServe: (handle: ServeHandle, opts?: { gracefulTimeoutMs?: number }) => Promise<void>
  HERMES_HOME_DIR: string
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

// TODO(Phase 5 / task 5.1): resolved relative to this file's location on
// disk, same as runtime/serve.mjs's own resolution above — revisit once this
// ships inside app.asar.
function agentsTemplatePath(): string {
  return join(__dirname, '../../../../runtime/templates/AGENTS.md')
}

let serveHandle: ServeHandle | undefined
let stopServeFn: ServeModule['stopServe'] | undefined
let gateway: GatewayClient | undefined
let sessionId: string | undefined
// Task 1.3: the vault currently open, if any. Opening/switching between
// existing projects is task 1.4 — this is only ever set by project:create.
let currentProject: OpenProject | undefined
// Bumped whenever sessions:new/sessions:switch assign sessionId directly, so
// an in-flight ensureSession() create can detect it was superseded and must
// not overwrite the newer sessionId with its own stale result.
let sessionEpoch = 0
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

/** Reads `<homeDir>/config.yaml`, merges in the saved model/baseUrl override
 * (task 0.15) via the pure line-based transform, and writes it back if
 * anything changed. Plaintext — model/baseUrl are not secrets. Logs (does
 * not throw) if config.yaml can't be read/parsed as expected, since a
 * missing model override must never block startup or a settings save. */
function applyModelConfigOverride(
  homeDir: string,
  settings: { model?: string; baseUrl?: string }
): void {
  if (!settings.model && !settings.baseUrl) return
  const configPath = join(homeDir, 'config.yaml')
  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to apply LLM settings', error)
    return
  }
  const merged = mergeModelIntoConfigYaml(original, settings)
  if (merged.unexpectedStructure) {
    console.warn(
      'aecpilot: config.yaml did not have the expected model: mapping — leaving it untouched'
    )
    return
  }
  if (!merged.changed) return
  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml with LLM settings', error)
  }
}

/** Builds the spawn-env override for `startServe` (task 0.15): only the
 * provider's credential env var, only when a key is actually stored and
 * decryptable. SECURITY: the decrypted value lives in this object only long
 * enough to be handed to `startServe`'s child_process spawn — never logged,
 * never returned from here to anything but that call. */
function buildExtraEnv(): Record<string, string> {
  const key = getDecryptedKey()
  return key ? { [PROVIDER_API_KEY_ENV_VAR]: key } : {}
}

/** Lazily creates the initial chat session (task 0.11) and caches its id.
 * Concurrent callers await the same in-flight creation rather than racing
 * separate `session.create` calls. The `sessions:new`/`sessions:switch`
 * handlers (task 0.14) also update `sessionId` directly once a session
 * already exists via them. */
async function ensureSession(): Promise<string> {
  if (sessionId) return sessionId
  if (!gateway) throw new Error('cannot create a chat session — gateway is not connected')
  if (!ensureSessionPromise) {
    const epoch = sessionEpoch
    ensureSessionPromise = gateway
      .request('session.create', {
        source: 'aecpilot-desktop'
        // TODO(Phase 1): cwd = vault root
      })
      .then((result) => {
        if (sessionEpoch !== epoch) {
          throw new Error('session changed during submit — try again')
        }
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

const APPROVAL_CHOICES = ['once', 'session', 'always', 'deny'] as const
type ApprovalChoice = (typeof APPROVAL_CHOICES)[number]
function isApprovalChoice(value: string): value is ApprovalChoice {
  return APPROVAL_CHOICES.includes(value as ApprovalChoice)
}

ipcMain.handle('chat:respond-approval', async (_event, choice: string, all?: boolean) => {
  if (!gateway || !sessionId) throw new Error('no active session')
  if (!isApprovalChoice(choice)) throw new Error('invalid approval choice')
  return gateway.request('approval.respond', {
    session_id: sessionId,
    choice,
    all
  })
})

ipcMain.handle('sessions:list', () => {
  if (!gateway) throw new Error('gateway is not connected')
  return gateway.request('session.list', { limit: 100 })
})

ipcMain.handle('sessions:new', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  const result = await gateway.request('session.create', { source: 'aecpilot-desktop' })
  sessionId = result.session_id
  sessionEpoch += 1
  ensureSessionPromise = undefined
  return { sessionId }
})

ipcMain.handle('sessions:switch', async (_event, id: string) => {
  if (!gateway) throw new Error('gateway is not connected')
  if (typeof id !== 'string' || id.length === 0) throw new Error('invalid session id')
  const result = await gateway.request('session.resume', { session_id: id })
  sessionId = result.session_id
  sessionEpoch += 1
  ensureSessionPromise = undefined
  return { sessionId: result.session_id, messages: result.messages ?? [] }
})

ipcMain.handle('gateway:get-state', () => gatewayState)

ipcMain.handle('settings:get', async () => {
  const settings = loadLlmSettings()
  let envOverridesKey = false
  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    envOverridesKey = keyEnvVarStatus(HERMES_HOME_DIR)
  } catch (error: unknown) {
    console.error('aecpilot: could not check profile .env for a key override', error)
  }
  return {
    model: settings.model,
    baseUrl: settings.baseUrl,
    hasKey: Boolean(settings.encryptedKey),
    encryptionAvailable: isEncryptionAvailable(),
    envOverridesKey
  }
})

ipcMain.handle('settings:save', async (_event, payload: unknown) => {
  const validated = validateSaveLlmSettingsPayload(payload)
  if (!validated.ok) throw new Error(validated.error)
  const { model, baseUrl, key } = validated.payload

  const current = loadLlmSettings()
  const next = {
    model: model !== undefined ? model : current.model,
    baseUrl: baseUrl !== undefined ? baseUrl : current.baseUrl,
    encryptedKey:
      key === null ? undefined : key !== undefined ? encryptKey(key) : current.encryptedKey
  }
  saveLlmSettings(next)

  // AEC_GATEWAY_URL (task 0.16 e2e mode): no hermes serve process is running
  // to restart — settings are saved, but nothing to reconnect.
  if (process.env.AEC_GATEWAY_URL) {
    return { ok: true, restarted: false }
  }

  try {
    const { startServe, waitHealthy, stopServe, HERMES_HOME_DIR } = await loadServeModule()

    if (serveHandle && stopServeFn) {
      const oldHandle = serveHandle
      serveHandle = undefined
      await stopServeFn(oldHandle)
    }

    applyModelConfigOverride(HERMES_HOME_DIR, next)
    serveHandle = await startServe({ extraEnv: buildExtraEnv() })
    stopServeFn = stopServe
    await waitHealthy(serveHandle, 30000)

    // Close the old gateway client before wiring a new one — avoids two
    // live clients racing to forward events/state to the same windows.
    gateway?.close()
    sessionId = undefined
    sessionEpoch += 1
    ensureSessionPromise = undefined
    await connectGateway(serveHandle.wsUrl)

    return { ok: true, restarted: true }
  } catch (error: unknown) {
    console.error('aecpilot: backend restart FAIL after settings save', error)
    return {
      ok: false,
      restarted: false,
      error: error instanceof Error ? error.message : 'backend restart failed'
    }
  }
})

ipcMain.handle('approvals:get-mode', async () => {
  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    const text = readFileSync(join(HERMES_HOME_DIR, 'config.yaml'), 'utf-8')
    return { mode: parseApprovalsMode(text) }
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to get the approvals mode', error)
    return { mode: 'manual' }
  }
})

// Task 0.17: writes the profile's config.yaml directly (no gateway RPC — the
// gateway's `config.set {key:'yolo'}` only toggles off<->manual, not
// 'smart'). hermes re-reads config.yaml per command (cached on
// mtime_ns+size), so this applies live — no serve restart needed or wanted.
ipcMain.handle('approvals:set-mode', async (_event, mode: string) => {
  if (!isApprovalMode(mode)) throw new Error('invalid approvals mode')
  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    const configPath = join(HERMES_HOME_DIR, 'config.yaml')
    const original = readFileSync(configPath, 'utf-8')
    const merged = mergeApprovalsModeIntoConfigYaml(original, mode)
    if (merged.unexpectedStructure) {
      return {
        ok: false,
        error: 'config.yaml has an unexpected approvals block — leaving it untouched'
      }
    }
    if (merged.changed) writeFileSync(configPath, merged.text, 'utf-8')
    return { ok: true, mode }
  } catch (error: unknown) {
    console.error('aecpilot: could not set the approvals mode in config.yaml', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'could not set the approvals mode'
    }
  }
})

// Task 1.3: opens a native "choose folder" dialog (createDirectory: true —
// the OS picker lets the user create a new empty folder in place) for the
// create-project flow. Returns null on cancel.
ipcMain.handle('project:pick-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('project:create', (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { dirPath, name } = payload as Record<string, unknown>
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    return { ok: false, error: 'dirPath must be a non-empty string' }
  }
  // Fix-iteration 1 (review minor): reject a non-absolute path before it
  // ever reaches generateVault. Not cross-checked against the last
  // project:pick-directory result — coordinator decision: out of scope for
  // the current threat model (residual risk tracked in TASKS.md Discovered).
  if (!isAbsolute(dirPath)) {
    return { ok: false, error: 'путь к папке должен быть абсолютным' }
  }
  if (typeof name !== 'string') {
    return { ok: false, error: 'name must be a string' }
  }

  const result = createProject(dirPath, name, agentsTemplatePath())
  if (!result.ok) return result

  currentProject = result.project
  try {
    recordRecent({ ...result.project, openedAt: new Date().toISOString() })
  } catch (error: unknown) {
    // Best-effort — a broken recents file must never block opening the
    // freshly-created project.
    console.error('aecpilot: could not record recent project', error)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('project:opened', result.project)
  }
  return result
})

ipcMain.handle('project:get-current', () => currentProject ?? null)

ipcMain.handle('project:list-recents', () => loadRecents())

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
          const { startServe, waitHealthy, stopServe, HERMES_HOME_DIR } = await loadServeModule()
          stopServeFn = stopServe

          // Task 0.15: apply any saved model/endpoint override to the profile's
          // config.yaml (plaintext — not a secret) and pass a decrypted API key
          // (if one is stored) into the child process env only — never written
          // to disk. This must happen before startServe spawns hermes.
          applyModelConfigOverride(HERMES_HOME_DIR, loadLlmSettings())
          serveHandle = await startServe({ extraEnv: buildExtraEnv() })

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
