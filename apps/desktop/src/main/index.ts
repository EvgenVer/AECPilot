import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
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
import {
  addSourceToProject,
  createProject,
  getScanIntervalSeconds,
  getSourceStatusResult,
  getSourceTreeResult,
  listProjectSources,
  openProject,
  removeSourceFromProject,
  type OpenProject
} from './project-manager'
import { loadRecents, recordRecent } from './recents'
import { runDetach, runScan } from './scan-runner'
import { ScanScheduler } from './scan-scheduler'
import { sessionIdsForProject, tagSessionProject, untaggedSessionIds } from './session-projects'
import {
  buildVaultTree,
  createDirEntry,
  createFileEntry,
  renameEntry,
  resolveVaultEntryRel
} from './vault-fs'
import type { ScanReportEnvelope } from '../shared/ipc'

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

interface RegisterAecSourcesModule {
  registerAecSources: (opts?: { projectJsonPath?: string }) => {
    projectJsonPath: string
    command: string
    configPath: string
    changed: boolean
  }
}

// Same dynamic-import rationale as loadServeModule above (task 1.20): a
// static import would let electron-vite inline runtime/register-aec-
// sources.mjs's source into out/main/index.js, breaking its own relative
// import of ./hermes-env.mjs.
// TODO(Phase 5 / task 5.1): same packaged-app caveat as loadServeModule.
async function loadRegisterAecSourcesModule(): Promise<RegisterAecSourcesModule> {
  const specifier = pathToFileURL(
    join(__dirname, '../../../../runtime/register-aec-sources.mjs')
  ).href
  return (await import(/* @vite-ignore */ specifier)) as RegisterAecSourcesModule
}

// reload.mcp shuts down every configured MCP server process-wide (not just
// aec-sources) and reconnects them — cheap enough (local stdio spawns) that
// 15s is generous, but still bounded well under the client's 60s default so
// project:open/create can't hang behind it (review fix, minor 3).
const RELOAD_MCP_TIMEOUT_MS = 15000

/** Registers the `aec-sources` MCP server against the opened project's
 * `project.json` (task 1.20, mechanic 1.12) — idempotent config.yaml edit —
 * and, only if that edit actually changed anything (review fix, nit 2: an
 * unchanged config means the same project is already registered — tearing
 * down every MCP server for nothing would be pure regression), forces hermes
 * to pick up the new args via the `reload.mcp` RPC (`confirm: true`, no live
 * session to warn — see `ReloadMcpParams`'s doc comment in
 * shared/gateway/types.ts for why this second step is required: hermes
 * caches a connected MCP server by name for the life of the `hermes serve`
 * process, so merely rewriting config.yaml does NOT reconnect an
 * already-running `aec-sources` server with the new `--project` path).
 * Best-effort throughout — a missing `aec-sources` binary (not built via
 * `uv sync` yet), a config.yaml write failure, a `reload.mcp` timeout/error,
 * or the gateway not being connected yet must never block opening/creating a
 * project; the agent just won't see this project's sources until the
 * condition is fixed and the project is reopened. */
async function registerAecSourcesForProject(vaultPath: string): Promise<void> {
  let changed: boolean
  try {
    const { registerAecSources } = await loadRegisterAecSourcesModule()
    ;({ changed } = registerAecSources({
      projectJsonPath: join(vaultPath, '.aecpilot', 'project.json')
    }))
  } catch (error: unknown) {
    console.error('aecpilot: could not register aec-sources for the opened project', error)
    return
  }
  if (!changed || !gateway) return
  try {
    const result = await gateway.request('reload.mcp', { confirm: true }, RELOAD_MCP_TIMEOUT_MS)
    if (result.status !== 'reloaded') {
      console.error(`aecpilot: reload.mcp did not reload (status=${result.status})`, result.message)
    }
  } catch (error: unknown) {
    console.error('aecpilot: could not reload MCP servers for the opened project', error)
  }
}

/** Abandons the active chat session on a project switch (task 1.20): the
 * next `chat:submit`/`sessions:new` call creates a fresh session scoped to
 * whichever project is current at that time (`cwd` = its vault, tagged in
 * session-projects.ts) — the minimal scoping the spec calls for, mirroring
 * the sessionId reset `settings:save` already does after a backend restart.
 * Does not close the old session server-side — it simply stops being
 * addressed by this app instance, same as any other superseded async
 * operation in this file. */
function resetActiveSessionForProjectSwitch(): void {
  sessionId = undefined
  sessionEpoch += 1
  ensureSessionPromise = undefined
}

let serveHandle: ServeHandle | undefined
let stopServeFn: ServeModule['stopServe'] | undefined
let gateway: GatewayClient | undefined
let sessionId: string | undefined
// Tasks 1.3/1.4: the vault currently open, if any — set by project:create or
// project:open. Switching projects mid-session replaces this and (task 1.20)
// abandons the active chat session — see resetActiveSessionForProjectSwitch.
let currentProject: OpenProject | undefined
// Bumped whenever sessions:new/sessions:switch assign sessionId directly, so
// an in-flight ensureSession() create can detect it was superseded and must
// not overwrite the newer sessionId with its own stale result.
let sessionEpoch = 0
let ensureSessionPromise: Promise<string> | undefined

// Task 1.14: the last completed scan's report, if any — read by
// `scan:get-state` so a renderer that mounts after a scan already finished
// (or between sessions) can hydrate without waiting for the next one. The
// actual scan (spawning the aec-rag CLI) and its schedule live in
// scanScheduler; this and `scanning` below just mirror its callbacks for
// polling/broadcast. Tagged as a `ScanReportEnvelope` (task 1.15 fix-
// iteration 1, review major) — see that type's doc comment for why.
let lastScanReport: ScanReportEnvelope | null = null
let scanning = false

// Runs `aec-rag scan` against whichever project is open *at scan time* (read
// via the closure below, not captured at construction) — one long-lived
// scheduler instance survives project switches; project:create/project:open
// call `.start()` with the newly-opened project's settings.scan_interval_s,
// and a project switch mid-scan just means that in-flight scan's report
// still lands (against the project it was started for), same as any other
// async operation racing a project switch elsewhere in this file.
const scanScheduler = new ScanScheduler<ScanReportEnvelope>(
  () => {
    if (!currentProject) return Promise.reject(new Error('нет открытого проекта'))
    // Fix-iteration 1 (review major, task 1.15): `vaultPath` is captured
    // here — this runner fires synchronously when the scan *starts*, not
    // when it resolves — so a scan begun against project A stays tagged A
    // even if the user switches to project B before `runScan` returns.
    // Renderer subscribers must drop an envelope whose vaultPath doesn't
    // match the project that's current *for them*.
    const vaultPath = currentProject.vaultPath
    return runScan(vaultPath).then((report) => ({ vaultPath, report }))
  },
  {
    onScanStart: () => {
      scanning = true
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('scan:state', true)
    },
    onReport: (envelope) => {
      scanning = false
      lastScanReport = envelope
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('scan:state', false)
        win.webContents.send('scan:report', envelope)
      }
    },
    onError: (error: unknown) => {
      scanning = false
      console.error('aecpilot: scan FAIL', error)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('scan:state', false)
    }
  }
)

// (Re)starts scanScheduler for a newly opened/created project (task 1.14):
// resets the last report (review fix, minor 4 — otherwise `scan:get-state`
// would hand a freshly-opened project B a report that's actually project A's,
// left over from before the switch), and clamps the configured interval
// (review fix, nit) — project-config.ts's validator only requires
// scan_interval_s > 0, no upper bound, and `setTimeout` silently clamps any
// delay past Node's signed-32-bit max to 1ms, which would otherwise turn an
// absurdly large configured interval into a scan storm.
const MAX_SET_TIMEOUT_MS = 2 ** 31 - 1
function startScanSchedulerForProject(vaultPath: string): void {
  lastScanReport = null
  scanScheduler.start(Math.min(getScanIntervalSeconds(vaultPath) * 1000, MAX_SET_TIMEOUT_MS))
}

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
    const project = currentProject
    ensureSessionPromise = gateway
      .request('session.create', {
        source: 'aecpilot-desktop',
        // Task 1.20 (specs/workspace-sources.md § API — "working dir агента
        // = vault"): only sent when a project is open, so a Phase 0-style
        // chat with no project keeps falling back to the gateway's own
        // launch cwd, unchanged.
        ...(project ? { cwd: project.vaultPath } : {})
      })
      .then((result) => {
        if (sessionEpoch !== epoch) {
          throw new Error('session changed during submit — try again')
        }
        sessionId = result.session_id
        if (project && result.stored_session_id) {
          tagSessionProject(result.stored_session_id, project.vaultPath)
        }
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

// Task 1.20: scoped to the open project — a session.list row only shows up
// once this app has tagged its (persisted, gateway-side) id against the
// current vault (see session-projects.ts's header comment for why the
// gateway's own session.list can't do this filtering itself). With no
// project open, the list is filtered down to NEVER-tagged sessions (review
// fix, minor 1) — otherwise every project's sessions would show up mixed
// together at app startup (currentProject is unset until a project is
// opened) and clicking one would silently resume a session that belongs to
// a different vault. Phase 0 sessions and chat-smoke.spec.ts's project-less
// mock-gateway session (neither ever tagged) stay visible either way.
ipcMain.handle('sessions:list', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  const result = await gateway.request('session.list', { limit: 100 })
  if (currentProject) {
    const taggedIds = sessionIdsForProject(currentProject.vaultPath)
    return { sessions: result.sessions.filter((s) => taggedIds.has(s.id)) }
  }
  const untagged = new Set(untaggedSessionIds(result.sessions.map((s) => s.id)))
  return { sessions: result.sessions.filter((s) => untagged.has(s.id)) }
})

ipcMain.handle('sessions:new', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  const project = currentProject
  const epoch = sessionEpoch
  const result = await gateway.request('session.create', {
    source: 'aecpilot-desktop',
    ...(project ? { cwd: project.vaultPath } : {})
  })
  // Tag regardless of whether this call wins the race below — even a
  // superseded session still belongs to `project` (captured above) and
  // should show up in ITS session list once that project is open again,
  // rather than being orphaned untagged.
  if (project && result.stored_session_id) {
    tagSessionProject(result.stored_session_id, project.vaultPath)
  }
  // Review fix, minor 2: a project switch (resetActiveSessionForProjectSwitch)
  // — or another sessions:new/sessions:switch — may have bumped sessionEpoch
  // while session.create above was in flight. Adopting this result as the
  // active session now would silently overwrite that reset with a session
  // built against the WRONG (now stale) project. Same guard ensureSession()
  // already uses.
  if (sessionEpoch !== epoch) return { sessionId: result.session_id }
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

ipcMain.handle('project:create', async (_event, payload: unknown) => {
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
  startScanSchedulerForProject(result.project.vaultPath)
  // Task 1.20: register aec-sources against THIS project's project.json
  // (mechanic 1.12) and abandon any session tied to whatever was open
  // before, before the recents/broadcast steps below — so by the time a
  // renderer can react to `project:opened`, both are already in place for
  // the very next chat message.
  await registerAecSourcesForProject(result.project.vaultPath)
  resetActiveSessionForProjectSwitch()
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

// Task 1.4: opens an existing vault (`.aecpilot/project.json` already
// present — see project-manager.ts's openProject for the read/validate
// logic). Re-opening the already-open project (same vaultPath) is a no-op
// success, without re-recording the recent entry or re-broadcasting
// project:opened — the UI already reflects it.
ipcMain.handle('project:open', async (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { vaultPath } = payload as Record<string, unknown>
  if (typeof vaultPath !== 'string' || vaultPath.length === 0) {
    return { ok: false, error: 'vaultPath must be a non-empty string' }
  }
  if (!isAbsolute(vaultPath)) {
    return { ok: false, error: 'путь к папке должен быть абсолютным' }
  }

  if (currentProject && currentProject.vaultPath === vaultPath) {
    return { ok: true, project: currentProject }
  }

  const result = openProject(vaultPath)
  if (!result.ok) return result

  currentProject = result.project
  startScanSchedulerForProject(result.project.vaultPath)
  // Task 1.20 — see the matching comment in project:create above.
  await registerAecSourcesForProject(result.project.vaultPath)
  resetActiveSessionForProjectSwitch()
  try {
    recordRecent({ ...result.project, openedAt: new Date().toISOString() })
  } catch (error: unknown) {
    // Best-effort — a broken recents file must never block opening the
    // project.
    console.error('aecpilot: could not record recent project', error)
  }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('project:opened', result.project)
  }
  return result
})

ipcMain.handle('project:get-current', () => currentProject ?? null)

// Task 1.14: "сканировать сейчас" — fires an immediate scan (a no-op if one
// is already in flight; watch scan:state/scan:report for the outcome, not
// this call's resolution). `scan:get-state` mirrors gateway:get-state's
// hydrate-on-mount pattern for the renderer's minimal "идёт сканирование"
// indicator.
ipcMain.handle('scan:trigger', () => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  void scanScheduler.triggerNow()
  return { ok: true }
})

ipcMain.handle('scan:get-state', () => ({ scanning, lastReport: lastScanReport }))

ipcMain.handle('project:list-recents', () => loadRecents())

// Task 1.7: lists the current project's connected sources. Empty array if no
// project is open or the config can't be read/validated.
ipcMain.handle('sources:list', () => {
  return currentProject ? listProjectSources(currentProject.vaultPath) : []
})

ipcMain.handle('sources:add', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, errors: ['нет открытого проекта'] }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, errors: ['invalid payload'] }
  }
  const { rootPath, confirmed } = payload as Record<string, unknown>
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    return { ok: false, errors: ['rootPath must be a non-empty string'] }
  }
  if (!isAbsolute(rootPath)) {
    return { ok: false, errors: ['путь к источнику должен быть абсолютным'] }
  }
  return addSourceToProject(currentProject.vaultPath, rootPath, {
    confirmed: confirmed === true
  })
})

// Task 1.8 fix-iteration 1: cheap per-source availability check (no
// directory read) — the sidebar calls this once per connected source on
// load, so every source's "RO"/"недоступен" badge shows up without a manual
// expand, and without the cost of a full recursive tree build per source.
ipcMain.handle('sources:status', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { sourceId } = payload as Record<string, unknown>
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { ok: false, error: 'sourceId must be a non-empty string' }
  }
  return getSourceStatusResult(currentProject.vaultPath, sourceId)
})

// Task 1.16: disconnects a source (BDD "Отключение источника") —
// project.json is the source of truth and is updated first; a best-effort
// `aec-rag detach` run then marks that source's index.db rows `detached`
// (never deleted). A detach failure (missing binary, timeout, …) is logged
// but does NOT roll back the project.json removal — it will catch up on a
// retry/next scan regardless.
ipcMain.handle('sources:remove', async (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { sourceId } = payload as Record<string, unknown>
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { ok: false, error: 'sourceId must be a non-empty string' }
  }

  const result = removeSourceFromProject(currentProject.vaultPath, sourceId)
  if (!result.ok) return result

  try {
    await runDetach(currentProject.vaultPath, sourceId)
  } catch (error: unknown) {
    console.error('aecpilot: aec-rag detach FAIL (best-effort)', error)
  }

  return result
})

// Task 1.8: builds a connected source's directory tree for the sidebar's
// "Источники" activity — read-only, no-op when no project is open (a stale
// renderer call after the project was closed mid-flight must never throw).
ipcMain.handle('sources:tree', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { sourceId } = payload as Record<string, unknown>
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { ok: false, error: 'sourceId must be a non-empty string' }
  }
  return getSourceTreeResult(currentProject.vaultPath, sourceId)
})

// Task 1.6: the vault explorer tree + file/folder create/rename/delete.
// Every handler is a no-op/`ok:false` when no project is open — the sidebar
// shows an empty-state instead of calling these, but a stale renderer call
// (e.g. after the project was closed mid-flight) must never throw.
ipcMain.handle('vault:tree', () => {
  if (!currentProject) return []
  try {
    return buildVaultTree(currentProject.vaultPath)
  } catch (error: unknown) {
    console.error('aecpilot: could not build vault tree', error)
    return []
  }
})

ipcMain.handle('vault:create-file', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { parentRel, name } = payload as Record<string, unknown>
  if (typeof name !== 'string') return { ok: false, error: 'name must be a string' }
  if (parentRel !== undefined && typeof parentRel !== 'string') {
    return { ok: false, error: 'invalid parentRel' }
  }
  try {
    createFileEntry(currentProject.vaultPath, parentRel as string | undefined, name)
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('vault:create-dir', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { parentRel, name } = payload as Record<string, unknown>
  if (typeof name !== 'string') return { ok: false, error: 'name must be a string' }
  if (parentRel !== undefined && typeof parentRel !== 'string') {
    return { ok: false, error: 'invalid parentRel' }
  }
  try {
    createDirEntry(currentProject.vaultPath, parentRel as string | undefined, name)
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('vault:rename', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel, newName } = payload as Record<string, unknown>
  if (typeof rel !== 'string' || typeof newName !== 'string') {
    return { ok: false, error: 'invalid payload' }
  }
  try {
    renameEntry(currentProject.vaultPath, rel, newName)
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Deletion is never permanent — the item goes to the OS recycle bin
// (shell.trashItem), and the renderer is expected to confirm with the user
// first. `resolveVaultEntryRel` rejects an escaping/empty/`.aecpilot` `rel`
// before shell.trashItem ever sees a path.
ipcMain.handle('vault:delete', async (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel } = payload as Record<string, unknown>
  if (typeof rel !== 'string') return { ok: false, error: 'rel must be a string' }
  let absPath: string
  try {
    absPath = resolveVaultEntryRel(currentProject.vaultPath, rel)
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  try {
    await shell.trashItem(absPath)
    return { ok: true }
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Не удалось переместить в корзину: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }
})

// "Показать в проводнике" (specs/workspace-sources.md § API contracts, UI
// operations) — read-only, opens the OS file manager with the item
// highlighted.
ipcMain.handle('vault:show-in-explorer', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel } = payload as Record<string, unknown>
  if (typeof rel !== 'string') return { ok: false, error: 'rel must be a string' }
  let absPath: string
  try {
    absPath = resolveVaultEntryRel(currentProject.vaultPath, rel)
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  shell.showItemInFolder(absPath)
  return { ok: true }
})

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
