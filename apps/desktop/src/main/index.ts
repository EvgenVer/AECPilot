import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  session,
  shell,
  systemPreferences,
  webContents
} from 'electron'
import type { OpenDialogOptions } from 'electron'
import * as fs from 'node:fs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ChildProcess } from 'node:child_process'
import { decideExternalLink, isOwnRendererUrl } from './external-link-policy'
import { decideMicrophoneAccess, isAllowedPermission } from './media-permission-pure'
import { isValidStreamId } from './speech-stream-pure'
import {
  AUTOWRITE_FILE,
  decideNoteWrite,
  mergeBackgroundReview,
  NOTE_FILES,
  NOTE_LIMITS,
  parseAutowrite,
  serializeAutowrite
} from './memory-notes-pure'
import { ensureVoiceInConfigYaml } from './speech-voice-pure'
import { ensureSectionList, ensureSectionScalar, ensureTopLevelList } from './config-yaml-pure'
import {
  DEFAULT_WAKE_PHRASE,
  setWakeIndicatorState,
  stopWakeIndicator,
  wakeIndicatorState
} from './wake-indicator'
import { isQuickEntryTarget } from './quick-entry-pure'
import { sessionToFollow } from './session-follow-pure'
import { planSelectPaths, type SelectPathsRequest } from './select-paths-pure'
import { claimCue, type ClaimState } from './ambient-claim-pure'
import {
  closeHud,
  hudState,
  beginHudMove,
  endHudMove,
  moveHudBy,
  onHudChanged,
  openHud,
  setHudBounds,
  setHudIgnoreMouse,
  setHudSession,
  setHudVibrancy,
  stopHud
} from './hud'
import {
  planAppWindow,
  planBrowserWindow,
  planSessionWindow,
  windowUrl,
  type WindowPlan
} from './windows-pure'
import { saveFileOut, saveImageOut, selectSavePath } from './save-out'
import { installNotifications, showNativeNotification } from './native-notify'
import { installPowerWatch, isOnBattery } from './power'
import { installAppLog, logDirectory, logRendererError, recentLogs } from './app-log'
import {
  configureConnection,
  connectionMode,
  connectionToken,
  connectionView,
  remoteTarget,
  saveConnection,
  sshSettings
} from './connection'
import { readConnectionInput, wsUrlFor, type SshSettings } from './connection-pure'
import {
  probeSsh,
  reachablePreviewUrl,
  sshConfigHosts,
  sshResolveHost,
  startSshTunnel,
  stopSshTunnel
} from './ssh'
import { readSshTarget, type SshTarget } from './ssh-pure'
import {
  applyProjectSkills,
  configureProjectSkills,
  projectSkillsView,
  setProjectSkillsTrust
} from './project-skills'
import {
  cronRunnerState,
  onCronRunnerChanged,
  restoreCronRunner,
  setCronRunner,
  stopCronRunner
} from './cron-runner'
import { hideQuickEntry, registerQuickEntry, unregisterQuickEntry } from './quick-entry'
import { loadAgentLanguage, saveAgentLanguage } from './agent-language'
import { applySoulLanguage, soulLanguageLine } from './agent-language-pure'
import { loadKeepAwake, releaseKeepAwake, restoreKeepAwake, setKeepAwake } from './keep-awake'
import { applyZoom, installZoomShortcuts, setZoomPercent, zoomPercent } from './zoom'
import { levelForPercent } from './zoom-pure'
import {
  closeSpeechStream,
  closeSpeechStreamsFor,
  openSpeechStream,
  sendSpeechFrame,
  streamKey
} from './speech-stream'
import {
  imageMime,
  isInside,
  isPreviewableImage,
  PREVIEW_MAX_BYTES,
  PREVIEW_OUTSIDE_PROJECT_ERROR,
  resolveArtifactPath
} from './artifact-files-pure'
import { hermesRest, type RestTarget } from './hermes-rest'
import { readRemoteDataUrl, readRemoteDocument, statRemoteFile } from './remote-files'
import { configureRoster, listRoster } from './roster'
import {
  mergeActiveWork,
  normalizeActiveWork,
  quitPromptFor,
  type ActiveWork,
  type QuitPrompt
} from './quit-guard-pure'
import { shouldBlockDevtoolsKey } from './devtools-block-pure'
import { isDevtoolsBlocked, restoreDevtoolsBlocked, setDevtoolsBlocked } from './devtools-block'
import { installPreviewGuestGuard } from './preview-guest'
import { installBrowserNavGestures } from './preview-nav'
import { readWindowBelow } from './os-windows'
import {
  disposeAllTerminals,
  disposeTerminal,
  disposeTerminalsOfWindow,
  resizeTerminal,
  startTerminal,
  terminalCwd,
  writeTerminal
} from './terminal'
import { readEditCommand, readSpellcheckAction } from './context-menu-pure'
import {
  addWordToGuestDictionary,
  applySpellcheckAction,
  configureSpellChecker,
  copyImageAtLastGesture,
  installContextMenuBridge
} from './context-menu'
import { installMediaProtocol, registerMediaScheme } from './media-proxy'
import { FILES_LIVE_ON_CORE_MACHINE } from './remote-files-pure'
import { decideGraphMark } from './graph-scope-pure'
import { decideFactsOpen } from './memory-facts-pure'
import { GRAPH_ENV_VARS, readGraphReadiness } from './graph-access-pure'
import type {
  CuratorStatus,
  GatewayRpcOutcome,
  GraphAccessState,
  GraphAddState,
  IngestState,
  LearningGraph,
  McpLiveStatus,
  McpServerSummary,
  SkillRow
} from '../shared/ipc'
import { classifyAttachment, IMAGE_DIALOG_EXTENSIONS } from '../shared/attachments'
import { GatewayClient } from '../shared/gateway/client'
import {
  EMPTY_WATERMARK,
  noteEvent,
  planCatchUp,
  readCatchUp,
  type ReplayWatermark
} from './event-replay-pure'
import {
  checkRestCall,
  checkRpcCall,
  classifyEnvWrite,
  describeRpcFailure,
  explainProfileDeleteFailure,
  markUntrustedPageText,
  sanitizeRpcParams
} from './gateway-passthrough-pure'
import type {
  AgentProcessEntry,
  GatewayConnectionState,
  GatewayEvent,
  GatewayEventFrame,
  GatewayServerResponse
} from '../shared/gateway/types'
import {
  buildProviderKeyEnv,
  encryptKey,
  isEncryptionAvailable,
  keyEnvVarStatus,
  loadLlmSettings,
  saveLlmSettings,
  setProviderKey,
  storedProviderKeyNames
} from './llm-settings'
import {
  isApprovalMode,
  isCredentialEnvVarName,
  mergeApprovalsModeIntoConfigYaml,
  mergeModelIntoConfigYaml,
  parseApprovalsMode,
  validateSaveLlmSettingsPayload
} from './llm-settings-pure'
import {
  addSourceToProject,
  createProject,
  getProjectSettings,
  getScanIntervalSeconds,
  updateProjectSettings,
  getSourceStatusResult,
  getSourceTreeResult,
  listProjectSources,
  openProject,
  removeSourceFromProject,
  type OpenProject
} from './project-manager'
import {
  CHECKPOINT_MARKERS,
  resolveCheckpointScope,
  type CheckpointScope
} from './checkpoint-scope-pure'
import {
  isValidProfileName,
  parseActiveProfile,
  parseProfileList,
  refuseProfileDeletion
} from './profiles-pure'
import { loadRecents, recordRecent } from './recents'
import { runDetach, runScan } from './scan-runner'
import { ScanScheduler } from './scan-scheduler'
import { sessionIdsForProject, tagSessionProject, untaggedSessionIds } from './session-projects'
import { readAttachmentDataUrl, saveAttachment } from './attachments'
import { rememberPickedPath, wasPickedByUser, wasPickedOrIsKnown } from './picked-paths'
import { previewWatchCount, startPreviewWatch, stopPreviewWatch } from './preview-watch'
import { decideOpenPreviewExternal } from './preview-external-pure'
import { decideWatch, realPathAllowed, WATCH_OUTSIDE_ERROR } from './preview-watch-pure'
import { decideWrite, realPathWritable, WRITE_OUTSIDE_ERROR } from './preview-write-pure'
import { cropCapture } from './preview-capture-pure'
import { resolveSourceContentRel, resolveSourceEntryRel } from './source-tree'
import {
  buildVaultTree,
  createDirEntry,
  createFileEntry,
  renameEntry,
  resolveVaultContentRel,
  resolveVaultEntryRel,
  writeVaultFile
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

interface RegisterAecRagModule {
  registerAecRag: (opts: { projectJsonPath: string }) => {
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

interface MemoryConfigModule {
  applyMemoryProfile: (opts: { hermesHomeDir: string; vaultPath: string }) => {
    changed: boolean
    key: string
  }
}

// Задача 5.2, та же причина динамического импорта, что у соседей выше.
async function loadMemoryConfigModule(): Promise<MemoryConfigModule> {
  const specifier = pathToFileURL(join(__dirname, '../../../../runtime/memory-config.mjs')).href
  return (await import(/* @vite-ignore */ specifier)) as MemoryConfigModule
}

interface HermesEnvModule {
  HERMES_SRC_DIR: string
  PYTHON_BIN: string
}

// Задача 5.16: читателю фактов памяти нужен python ЯДРА (mem0 стоит в его venv)
// и корень их исходников. Динамический импорт — та же причина, что у соседей.
async function loadHermesEnvModule(): Promise<HermesEnvModule> {
  const specifier = pathToFileURL(join(__dirname, '../../../../runtime/hermes-env.mjs')).href
  return (await import(/* @vite-ignore */ specifier)) as HermesEnvModule
}

interface SecretFilterModule {
  installSecretFilter: (hermesHomeDir: string) => { changed: boolean }
}

// Задача 5.3, та же причина динамического импорта, что у соседей выше.
async function loadSecretFilterModule(): Promise<SecretFilterModule> {
  const specifier = pathToFileURL(
    join(__dirname, '../../../../runtime/register-secret-filter.mjs')
  ).href
  return (await import(/* @vite-ignore */ specifier)) as SecretFilterModule
}

// Same dynamic-import rationale as the loader above (task 2.12).
async function loadRegisterAecRagModule(): Promise<RegisterAecRagModule> {
  const specifier = pathToFileURL(join(__dirname, '../../../../runtime/register-aec-rag.mjs')).href
  return (await import(/* @vite-ignore */ specifier)) as RegisterAecRagModule
}

interface RegisterAecRosterModule {
  registerAecRoster: () => { changed: boolean; configPaths: string[] }
  writeRosterSnapshot: (specialists: { name: string; title?: string }[]) => boolean
}

// Same dynamic-import rationale as the loaders above (task 3C.7).
async function loadRegisterAecRosterModule(): Promise<RegisterAecRosterModule> {
  const specifier = pathToFileURL(
    join(__dirname, '../../../../runtime/register-aec-roster.mjs')
  ).href
  return (await import(/* @vite-ignore */ specifier)) as RegisterAecRosterModule
}

/**
 * Держит инструмент обращения в рабочем состоянии (задача 3C.7).
 *
 * ДВЕ РАЗНЫЕ ВЕЩИ, И ТОЛЬКО ОДНА ИЗ НИХ ТРЕБУЕТ ПЕРЕЗАПУСКА:
 *
 * * снимок роестра инструмент читает при каждом вызове — новая запись видна
 *   сразу, перезагружать нечего;
 * * запись в `config.yaml` профиля видна ядру только после `reload.mcp` — оно
 *   держит подключённый MCP-сервер по имени всю жизнь процесса. Поэтому
 *   перезапуск идёт ровно тогда, когда появился профиль без инструмента, то
 *   есть после создания специалиста.
 *
 * Всё лучшее-из-возможного: без собранного пакета (`uv sync` не прогоняли) или
 * при недоступном `config.yaml` роестр обязан открыться и работать — просто
 * обращения по имени не будет, пока условие не поправят.
 */
async function syncRosterTool(specialists: { name: string; title: string }[]): Promise<void> {
  try {
    const { registerAecRoster, writeRosterSnapshot } = await loadRegisterAecRosterModule()
    writeRosterSnapshot(specialists)
    if (registerAecRoster().changed) await reloadMcp()
  } catch (error: unknown) {
    console.error('aecpilot: could not sync the aec-roster tool', error)
  }
}

// reload.mcp shuts down every configured MCP server process-wide (not just
// aec-sources) and reconnects them — cheap enough (local stdio spawns) that
// 15s is generous, but still bounded well under the client's 60s default so
// project:open/create can't hang behind it (review fix, minor 3).
const RELOAD_MCP_TIMEOUT_MS = 15000

/** Forces hermes to disconnect and reconnect every configured MCP server via
 * the `reload.mcp` RPC (`confirm: true`, no live session to warn — see
 * `ReloadMcpParams`'s doc comment in shared/gateway/types.ts for why this is
 * needed at all: hermes caches a connected MCP server by name for the life of
 * the `hermes serve` process and does NOT reconnect it just because its
 * backing data changed underneath it). Still true on 0.20.0, re-measured by
 * `runtime/mcp-project-switch-probe.mjs` (task 1.7.8): their new lazy start
 * from an on-disk schema cache re-fingerprints when the project path in `args`
 * changes, but that only affects the tool LIST — an already-spawned stdio
 * child keeps serving the old project until this reload, and even a brand-new
 * session sees the old sources. Shared by `registerAecSourcesForProject`
 * (task 1.20) and the `sources:add`/`sources:remove` IPC handlers (bugfix:
 * an added/removed source was invisible to the agent until a project switch)
 * — those two only ever rewrite project.json, never config.yaml, so
 * `registerAecSourcesForProject`'s own "config unchanged, skip the reload"
 * gate would never fire a reload for them; they call this unconditionally
 * instead. Best-effort — no gateway connected yet, a timeout, or an RPC error
 * must never block whatever project.json write already succeeded; logged,
 * not thrown. Deliberately does not touch `sessionId`/session state: the
 * active chat session (same project, same cwd) stays alive and picks up the
 * refreshed `aec-sources` data on its very next tool call — see the "does not
 * reset the session" note on the `sources:add`/`sources:remove` handlers. */
async function reloadMcp(): Promise<void> {
  if (!gateway) return
  try {
    const result = await gateway.request('reload.mcp', { confirm: true }, RELOAD_MCP_TIMEOUT_MS)
    if (result.status !== 'reloaded') {
      console.error(`aecpilot: reload.mcp did not reload (status=${result.status})`, result.message)
    }
  } catch (error: unknown) {
    console.error('aecpilot: could not reload MCP servers', error)
  }
}

/** Registers the `aec-sources` MCP server against the opened project's
 * `project.json` (task 1.20, mechanic 1.12) — idempotent config.yaml edit —
 * and, only if that edit actually changed anything (review fix, nit 2: an
 * unchanged config means the same project is already registered — tearing
 * down every MCP server for nothing would be pure regression), forces hermes
 * to pick up the new args via `reloadMcp()`.
 * Best-effort throughout — a missing `aec-sources` binary (not built via
 * `uv sync` yet) or a config.yaml write failure must never block opening/
 * creating a project; the agent just won't see this project's sources until
 * the condition is fixed and the project is reopened. */
async function registerAecSourcesForProject(vaultPath: string): Promise<void> {
  const projectJsonPath = join(vaultPath, '.aecpilot', 'project.json')
  let changed = false
  try {
    const { registerAecSources } = await loadRegisterAecSourcesModule()
    ;({ changed } = registerAecSources({ projectJsonPath }))
  } catch (error: unknown) {
    console.error('aecpilot: could not register aec-sources for the opened project', error)
    return
  }

  // `aec-rag` is registered in the same breath and for the same reason (task
  // 2.12): without it the agent has no way to search the project's documents
  // at all, and the `aec-qa` skill would be instructions for tools that are not
  // there. Separately caught — a project whose sources work but whose index
  // does not is still a usable project, and the reverse of that is a failed
  // `uv sync`, not a broken project.
  try {
    const { registerAecRag } = await loadRegisterAecRagModule()
    const rag = registerAecRag({ projectJsonPath })
    changed = changed || rag.changed
  } catch (error: unknown) {
    console.error('aecpilot: could not register aec-rag for the opened project', error)
  }

  // Задача 5.2 (спека `agent-memory.md`): второй слой памяти включается и
  // получает ПРОЕКТНЫЙ скоуп. Отдельным try — профиль без расширенной памяти
  // остаётся рабочим профилем, и человек узнаёт о ней сообщением (5.1б), а не
  // закрытым проектом. Перезагрузки ядра не требует: провайдер грузится заново
  // на каждый ход и перечитывает `mem0.json` (замерено зондом 2026-09-09).
  try {
    const { applyMemoryProfile } = await loadMemoryConfigModule()
    const { HERMES_HOME_DIR } = await loadServeModule()
    applyMemoryProfile({ hermesHomeDir: HERMES_HOME_DIR, vaultPath })
  } catch (error: unknown) {
    console.error('aecpilot: could not apply the memory profile for the opened project', error)
  }

  if (!changed) return
  await reloadMcp()
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

/** D-98 (задача 3F.7). Их рендерер заводит и переключает сессии САМ — через
 * проход `gateway:rpc`, — а всё «наследие» главного процесса (быстрый ввод,
 * панель «Изменения», вложения, ветвление) адресует `sessionId`: сессию,
 * которую главный процесс когда-то завёл сам (`ensureSession` по первому
 * `model:options`) и больше НИКОГДА не менял. Быстрый ввод «в текущую сессию»
 * уходил в сессию-сироту, которой на экране нет.
 *
 * Здесь главный процесс следует за окном: ответ `session.create`/
 * `session.activate`/`session.resume` с `session_id` и есть «текущая сессия»
 * человека — ровно то, что делают `sessions:switch`/`sessions:activate`, только
 * источник — их собственный вызов. Последняя открытая окном сессия — не
 * идеал при плитках и фоновых сессиях, но это та, на которую человек смотрел
 * последней, а не та, которой не видел никогда. */
function followWindowSession(method: string, value: unknown): void {
  const id = sessionToFollow(method, value, sessionId)
  if (id === null) return
  sessionId = id
  sessionEpoch += 1
  ensureSessionPromise = undefined
}

let serveHandle: ServeHandle | undefined
let gatewayUrl: string | undefined
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
// Task 1.6.B5.23: the profile new/resumed sessions are built against. Undefined
// means the profile `hermes serve` was launched with, which is the only
// behaviour before batch 5. Their `POST /api/profiles/active` does NOT retarget
// a running process (their own comment says so) — passing `profile` on
// session.create/resume is what actually moves a chat to another profile.
let sessionProfile: string | undefined

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
  // То же основание, что и у `scan:trigger`: расписание, которое молча
  // перечитывает чужие документы для чужого ядра, — это трата и путаница.
  if (filesAreRemote()) {
    scanScheduler.stop()
    return
  }
  scanScheduler.start(Math.min(getScanIntervalSeconds(vaultPath) * 1000, MAX_SET_TIMEOUT_MS))
}

// Mirrors the gateway's connection state so a freshly-loaded renderer can pull
// the current value on mount (see `gateway:get-state`). The initial 'ready'
// fires while no window exists to receive the push, so a push-only channel
// would leave the renderer stuck at 'closed'.
let gatewayState: GatewayConnectionState = 'closed'
/** Метод каждого открытого вопроса ядра по его id — чтобы на ответ окна
 * поставить пометку R22 по ИМЕНИ запроса, которого в ответе нет. Запись живёт
 * до ответа или отзыва (`request.cancel`); ядро минтит один id на вопрос. */
const serverRequestMethods = new Map<string, string>()
/** Отметка догона событий: до какого номера кадра окна всё получили. */
let replayWatermark: ReplayWatermark = EMPTY_WATERMARK

/** Wires a `GatewayClient` for `url` into the app: forwards events/state to
 * every window and attempts the initial connect (tolerating failure — the
 * window still opens, chat just won't be able to connect yet). Shared by the
 * normal `hermes serve` startup path and the `AEC_GATEWAY_URL` e2e override
 * (task 0.16), which points this at a mock gateway instead of spawning
 * `hermes serve`. */
async function connectGateway(url: string): Promise<void> {
  // SECURITY: the url embeds the gateway auth token. It is remembered HERE, in
  // main, so a re-dial after the machine wakes (task 3.28) has something to
  // dial; it never crosses IPC and is never logged.
  gatewayUrl = url
  gateway = new GatewayClient({ url })
  replayWatermark = EMPTY_WATERMARK
  gateway.onEvent((event: GatewayEvent) => {
    // Отметка догона ведётся ПО ВСЕМ кадрам, включая чужие сессии и
    // бессессионные: нумерация в шлюзе сквозная, и пропуск кадра здесь
    // означал бы просьбу переслать то, что уже приходило (задача 3.B2г).
    replayWatermark = noteEvent(replayWatermark, event as GatewayEventFrame['params'])

    if (event.type === 'request.cancel') {
      // Отзыв вопроса: карточку снимает то окно, которое её показало.
      const cancelled = event.payload as { id?: unknown } | undefined
      if (typeof cancelled?.id === 'string') serverRequestMethods.delete(cancelled.id)
    }
    // Все кадры, всем окнам (D-97, задача 3F.5). До 20.09.2026 здесь стоял
    // фильтр «только сессия, которую завёл главный процесс» — наследие панели
    // чата фазы 0. Их рендерер заводит сессии САМ, через `gateway:rpc`, и
    // главный процесс их не знает: стоило `model:options` (карточка «С чего
    // начать») завести свою сессию, как ответы в их чате переставали доезжать
    // — ход висел на «загружает ответ» вечно. Мок прятал это, отвечая одним
    // id на каждый `session.create`; вскрылось на моке с разными id. В их
    // приложении сокет был у рендерера, и он видел все кадры — маршрутизация
    // по сессии у них своя (плитки, фоновые сессии).
    rememberMcpStatus(event)
    broadcastToWindows('chat:event', event)
  })
  // Вопросы ядра окну (0.21.3, задача 3.B5в): уточнение, подтверждение команды,
  // секрет, sudo, чтение терминала/предпросмотра, согласие на MCP, шаг тура.
  // Идут во ВСЕ окна без фильтра по сессии — фоновая сессия тоже вправе
  // спросить, а какому окну отвечать, решают обработчики донора (чтение
  // предпросмотра — то, чья сессия на экране). Первый ответ на id уходит
  // ядру, остальные глушит клиент.
  gateway.onServerRequest((request) => {
    serverRequestMethods.set(request.id, request.method)
    broadcastToWindows('gateway:server-request', request)
  })
  gateway.onStateChange((state) => {
    const wasReconnecting = gatewayState === 'reconnecting'
    gatewayState = state
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('gateway:state', state)

    // Связь вернулась после обрыва — догнать то, что окно пропустило.
    if (state === 'ready' && wasReconnecting) void catchUpAfterReconnect()
  })

  try {
    await gateway.connect()
  } catch (error: unknown) {
    // Same tolerance as a serve-start failure — the window still
    // opens, the chat just won't be able to connect yet.
    console.error('aecpilot: gateway connect FAIL', error)
  }

  // Задача 3D.4. Снимок роестра кормится отсюда, а не из окна: связь с ядром
  // есть здесь, и она переживает и закрытое окно, и смену поверхности роестра.
  // Опрос идёт и при неудачном `connect()` — клиент сам переподключается, а
  // тик, попавший в момент обрыва, просто ничего не запишет.
  startRosterSnapshotPolling()
}

/** Догон событий после обрыва связи (задача 3.B2г).
 *
 * Обрыв посреди хода — это окно, в котором обычное восстановление бессильно:
 * сессия читается из базы, а строка хода попадает туда по его завершении.
 * Замер `runtime/session-events-probe.mjs`: на одном таком обрыве переигровка
 * вернула 61 дельту, а `session.resume` — ответ ассистента длиной ноль.
 *
 * Кадры уходят окну ТЕМ ЖЕ каналом, что и живые: для него они неотличимы, и
 * код донора не трогается вовсе. */
async function catchUpAfterReconnect(): Promise<void> {
  const client = gateway
  if (!client) return

  const plan = planCatchUp(replayWatermark, Boolean(sessionId))
  if (plan.action === 'skip') {
    // Тишина здесь законна, но её причина должна быть видна в журнале: иначе
    // «догон не сработал» и «догонять было нечего» выглядят одинаково.
    console.info(`aecpilot: догон событий пропущен (${plan.reason})`)
    return
  }

  try {
    const answer = await client.request('session.events.since', {
      session_id: sessionId ?? '',
      last_seen: plan.lastSeen
    })

    const reading = readCatchUp(replayWatermark, answer)
    replayWatermark = reading.watermark

    for (const frame of reading.deliver) {
      const event = frame.params as GatewayEvent
      if (event.session_id && event.session_id !== sessionId) continue
      rememberMcpStatus(event)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('chat:event', event)
    }

    console.info(
      `aecpilot: догнано событий ${reading.deliver.length}` + (reading.gap ? ' (с пропуском)' : '')
    )

    if (reading.gap) {
      // Дыру догон не закрыл — часть кадров потеряна безвозвратно. Врать об
      // этом нечем: историю окно перечитывает своим путём при восстановлении,
      // и запись в журнале нужна, чтобы потерю можно было объяснить.
      console.warn('aecpilot: часть событий потеряна — кольцо шлюза проехало точку догона')
    }
  } catch (error: unknown) {
    // Старое ядро не знает метода, и это не сбой: догон просто не работает.
    console.warn('aecpilot: догон событий не удался', error)
  }
}

/** Одно сообщение всем живым окнам. */
function broadcastToWindows(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

/** Сколько ждать ответа на проверочный вопрос после пробуждения. Секунда с
 * запасом: шлюз локальный, и если он жив, он отвечает мгновенно. */
const RESUME_PROBE_TIMEOUT_MS = 5000
/** Сколько раз пробовать перезвонить и с каким промежутком. Шлюз просыпается
 * вместе с машиной и может быть ещё не готов принимать соединения. */
const RESUME_REDIAL_ATTEMPTS = 5
const RESUME_REDIAL_DELAY_MS = 3000

/** Проверка связи после пробуждения машины (задача 3.28).
 *
 * Спрашивать имеет смысл ТОЛЬКО когда клиент считает себя подключённым: если он
 * уже переподключается, у него свой отсчёт с нарастающей паузой, и вмешиваться
 * значит его сбить. А `close()` выключает автоматическое переподключение —
 * поэтому за ним обязан идти собственный цикл повторов, иначе неудачный первый
 * звонок оставил бы приложение отключённым навсегда.
 */
async function revalidateGatewayAfterResume(): Promise<void> {
  if (!gateway || !gatewayUrl || gatewayState !== 'ready') return

  try {
    await gateway.request('session.list', { limit: 1 }, RESUME_PROBE_TIMEOUT_MS)
    return
  } catch {
    console.warn('aecpilot: gateway did not answer after resume — re-dialing')
  }

  const url = gatewayUrl
  gateway.close()

  for (let attempt = 0; attempt < RESUME_REDIAL_ATTEMPTS; attempt += 1) {
    await connectGateway(url)
    if (gatewayState === 'ready') return
    await new Promise((resolve) => setTimeout(resolve, RESUME_REDIAL_DELAY_MS))
  }

  console.error('aecpilot: gateway still unreachable after resume')
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

/** Task 3.7a — writes the default speech voice into `config.yaml` when it has
 * none. Their default is English, and Edge answers a voice-vs-script mismatch
 * with an EMPTY audio stream, so on a clean install a Russian reply is not
 * spoken at all. Runs on every start and does nothing once a voice is set, so
 * the user's own choice survives. Failure here never blocks startup: the worst
 * case is the state we had before. */
function applyDefaultSpeechVoice(homeDir: string): void {
  const configPath = join(homeDir, 'config.yaml')
  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to apply the default voice', error)
    return
  }
  const merged = ensureVoiceInConfigYaml(original)
  if (merged.unexpectedStructure) {
    console.warn('aecpilot: config.yaml has a tts: scalar — leaving the voice untouched')
    return
  }
  if (!merged.changed) return
  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml with the default voice', error)
  }
}

/** Задача 3.B1д — граница длительности одного прогона агента.
 *
 * ЗАЧЕМ. До 0.20.5 у агента был предел ходов (500), и он был единственной
 * встроенной границей цикла. В 0.20.5 ядро его сняло — обоснованно: предел
 * рвал задачу на середине. Взамен появился бюджет по часам, но ВЫКЛЮЧЕННЫЙ,
 * а сторожа от зацикливания только помечают повтор, никогда не останавливая.
 * Итог без этой правки: зациклившийся агент считает деньги на платной модели,
 * пока человек не остановит его руками. Решение владельца 2026-08-23 — бюджет.
 *
 * ПОЧЕМУ ЧАС. Их же таймаут зависшего ХОДА — 1800 секунд, значит бюджет на
 * весь прогон обязан быть заметно больше одного хода, иначе он будет срабатывать
 * на честной длинной работе. Час даёт запас на многошаговую задачу и при этом
 * превращает «бесконечно» в «до часа». Значение подобрано, а не измерено: точку
 * даст ручная приёмка на настоящем проекте, и менять его человек может прямо в
 * этом файле — правило ниже его выбор не трогает.
 *
 * ЧЕГО ЭТО НЕ ДЕЛАЕТ: не обрывает на полуслове. За 80% бюджета ядро само
 * предупреждает агента, и тот успевает свернуть мысль. */
const RUN_BUDGET_SECONDS = 3600

/**
 * Потолок повторяющихся пробуждений внутри сессии (`/loop`, замечание D-40,
 * решение владельца 2026-08-24).
 *
 * ПОЧЕМУ ЭТО ВООБЩЕ НАС КАСАЕТСЯ. Каталог слэш-команд наш интерфейс берёт у
 * ядра, значит `/loop` появляется в композере БЕЗ нашей работы. Каждый тик —
 * настоящий ход агента, а их умолчание `loops.max_ticks` = 100: одной строкой
 * заводится цикл на сто ходов. Сто — это не умолчание, а ловушка.
 *
 * ЧЕМ ЭТО НЕ ЯВЛЯЕТСЯ: запретом. Дойдя до потолка, ядро ЖДЁТ, а не обрывает —
 * цикл встаёт на паузу с текстом «/loop resume to keep going, /loop stop to end
 * it». Человек продолжает одной командой; счётчик при этом не сбрасывается, то
 * есть каждое «продолжить» покупает следующий тик и спрашивает снова.
 *
 * ЧТОБЫ ИДТИ ДОЛГО, НЕ ПЕРЕСПРАШИВАЯ, число правится прямо в `config.yaml`
 * (`0` = без предела). Правило ниже дописывает ключ ТОЛЬКО если его там нет —
 * выбранное человеком значение переживает все следующие запуски.
 */
const LOOP_MAX_TICKS = 10

/** Провайдер веб-поиска по умолчанию (задача 3E.2, UR32). Пакет `ddgs` стоит в
 * venv ядра; без него ядро ответит честной ошибкой, а не уйдёт на бесключевой
 * ярус — см. `applyWebBackend`. */
const DEFAULT_WEB_BACKEND = 'ddgs'

/** Дописывает умолчание в `config.yaml`, не трогая уже выбранное человеком. */
function applyConfigDefault(
  homeDir: string,
  section: string,
  key: string,
  value: boolean | number | string,
  what: string
): void {
  const configPath = join(homeDir, 'config.yaml')

  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error(`aecpilot: could not read config.yaml to apply ${what}`, error)
    return
  }

  const merged = ensureSectionScalar(original, section, key, value)
  if (merged.unexpectedStructure) {
    console.warn(`aecpilot: config.yaml has a ${section}: scalar — leaving ${what} untouched`)
    return
  }
  if (!merged.changed) return

  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error(`aecpilot: could not write config.yaml with ${what}`, error)
  }
}

function applyRunBudget(homeDir: string): void {
  applyConfigDefault(homeDir, 'agent', 'run_budget_seconds', RUN_BUDGET_SECONDS, 'the run budget')
}

function applyLoopBudget(homeDir: string): void {
  applyConfigDefault(homeDir, 'loops', 'max_ticks', LOOP_MAX_TICKS, 'the loop tick budget')
}

/** Задача 3.B4д (решение владельца 2026-09-14, интервью 3.B4б). Два умолчания
 * ядра 0.21.2, которые нам не подходят, закрепляются в профиле — именно
 * УМОЛЧАНИЕМ: человек правит значение в том же файле, и правило его больше
 * не трогает.
 *
 * `sessions.auto_prune` — с 0.21.2 `true`: удалять завершённые сессии старше
 * 90 дней при старте. У `hermes serve` этот код не исполняется вовсе
 * (`reading-0.21.2.md` §2.2); строка страхует историю разговоров (UR4) на
 * случай ручного `hermes` на нашем профиле или переноса вызова в `serve`.
 *
 * `nous.guest` — бесплатный ярус их облака: без настроенного провайдера ядро
 * само заводит анонимную личность Nous. Их облако — SPEC HX3; сегодня код
 * стоит за их же флагом предрелиза, и `false` закрепляет отказ на случай,
 * когда флаг снимут.
 *
 * `updates.check` — задача 3.B5д (решение владельца 2026-09-15, замечание
 * D-88, SPEC R10). Каждый старт шлюза ходит на `api.github.com` сравнить наш
 * HEAD с их `main` (`prefetch_update_check` → `check_for_updates(passive=True)`
 * в `hermes_cli/banner.py`) и пишет `.update_check` в профиль. Пин по SHA
 * делает это бесполезным, а исходящего запроса ядра нет на экране каналов.
 * Passive-ветка чтит ключ: `updates.check: false` — и запроса нет. */
function applyCoreOptOuts(homeDir: string): void {
  applyConfigDefault(homeDir, 'sessions', 'auto_prune', false, 'the session auto-prune opt-out')
  applyConfigDefault(homeDir, 'nous', 'guest', false, 'the Nous free-tier opt-out')
  applyConfigDefault(homeDir, 'updates', 'check', false, 'the core update-check opt-out')
}

/** Задача 3E.2 — ВЫБОР ПРОВАЙДЕРА ВЕБ-ПОИСКА, а не его включение.
 *
 * Поиск у агента был и до этой задачи, и в этом всё дело. Без записанного
 * выбора ядро идёт по лестнице автоопределения и заканчивает БЕСКЛЮЧЕВЫМ
 * ярусом: запрос уходит на публичную точку Exa (`plugins/web/keyless_mcp.py`,
 * замерено 2026-09-05 — `use_keyless('exa','')` вернул True). То есть запросы
 * человека покидали машину через третью сторону, которую никто не выбирал и
 * человеку не назвал. Для продукта, отказавшегося от иконок сайтов, чтобы не
 * платить исходящим запросом за картинку (HX21), это не мелочь.
 *
 * `web.backend` записан у ядра как ОКОНЧАТЕЛЬНЫЙ: «stored selection is final —
 * no availability probe, no fallback», чтобы сломанный выбор давал честную
 * ошибку вместо тихого перенаправления (`tools/web_tools.py::_get_backend`).
 * Это ровно то поведение, которого требует задача: молчаливый отказ — дефект.
 *
 * Умолчание `ddgs` — решение владельца 2026-09-05 («по максимуму все
 * провайдеры, по умолчанию DuckDuckGo»). Ключа не требует, запрос идёт с
 * машины человека прямо в DuckDuckGo, а не через чужой ретранслятор. Выбор,
 * сделанный человеком в их панели настроек, переживает перезапуск — правило
 * `applyConfigDefault` дописывает ключ только когда его нет. */
function applyWebBackend(homeDir: string): void {
  applyConfigDefault(homeDir, 'web', 'backend', DEFAULT_WEB_BACKEND, 'the web search provider')
}

/**
 * Задача 3E.3 (UR31), ПЕРЕПИСАНА решением владельца 2026-09-08 (задача 3E.17).
 *
 * ЧТО ЗДЕСЬ БЫЛО И ПОЧЕМУ ЭТОГО БОЛЬШЕ НЕТ. Задача 3E.3 записывала
 * `browser.backend: "off"` — их же документированный способ вернуть встроенный
 * набор из десяти узких инструментов (`browser_navigate`, `browser_click`, …).
 * Основанием были три требования: R19 (скрытых ходов нет — `browser_click(ref)`
 * человек читает в ленте, а `browser_exec(code=…)` виден только тем, что он
 * был), R21 (разрушающее подтверждает человек, а код в отдельном демоне
 * `detect_dangerous_command` не видит вовсе) и R22 (действия в странице видны).
 *
 * ВЛАДЕЛЕЦ ВЫБРАЛ ДРУГОЕ, и цена предъявлена ему полностью: берём `browser_exec`
 * — «SOTA web harness», их собственная оценка, — и вместе с ним все три
 * следствия выше плюс четвёртое: `uvx browser-use` тянет пакет с PyPI В МОМЕНТ
 * ВЫЗОВА, без нашего веттинга и без работы офлайн (спрошено отдельным вопросом,
 * ответ — «оставить как у донора»). Записано словами в SPEC R21 и UR32, чтобы
 * цена не растворилась в фразе «браузер стал мощнее».
 *
 * ПОЭТОМУ КЛЮЧА ЗДЕСЬ БОЛЬШЕ НЕТ — и это не «вернули умолчание», а решение с
 * последствием: при пустом `browser.backend` ядро включает режим Browser Use
 * CLI, «если CLI вообще запускается» (`is_browser_use_cli_mode` → `_find_cli`:
 * ищет бинарь `browser-use` и `uvx` на PATH, ничего не скачивая). Значит ФОРМА
 * браузерной поверхности зависит от машины: где `uv` есть — один инструмент с
 * кодом, где нет — прежние десять узких. Это их же поведение («so browsing
 * never silently breaks»), и владелец выбрал повторить его как есть.
 *
 * СТАРЫЙ КЛЮЧ В УЖЕ СУЩЕСТВУЮЩЕМ КОНФИГЕ МЫ НЕ УДАЛЯЕМ. `browser.backend: off`,
 * записанный прежней версией, останется, и на такой машине набор будет прежним,
 * пока ключ не убрать руками (их панель настроек это умеет). Автоматически
 * стирать его нельзя: отличить НАШЕ прежнее умолчание от ВЫБОРА ЧЕЛОВЕКА,
 * сделанного в той же панели, по файлу невозможно, а «мы лучше знаем» — не то
 * правило, по которому трогают чужой конфиг. Профиль разработки почищен вручную
 * задачей 3E.17, иначе решение не проверялось бы живым вызовом.
 *
 * `cloud_provider: "local"` ОСТАЁТСЯ. Это другой вопрос — ГДЕ работает браузер,
 * а не какой формы инструмент. Их строка «★ recommended · free · Headless
 * Chromium, no API key needed»; облачные (Browserbase, Firecrawl, Nous
 * Subscription) остаются в их панели со своими ключами и без нашего
 * вмешательства.
 *
 * Выбор человека не трогается: `applyConfigDefault` дописывает ключ только
 * когда его нет.
 */
function applyBrowserBackend(homeDir: string): void {
  applyConfigDefault(homeDir, 'browser', 'cloud_provider', 'local', 'where the browser runs')
}

/**
 * Задача 3E.7 (риск R21) — ПОДТВЕРЖДАЕТ ЧЕЛОВЕК, и это записано, а не унаследовано.
 *
 * У ядра три режима: `manual` — спрашивает человека, `smart` — решает
 * вспомогательная модель, `off` — не спрашивает никого. R21 говорит
 * «подтверждение ЧЕЛОВЕКОМ на разрушающие команды», то есть подходит ровно
 * один из трёх.
 *
 * ПОЧЕМУ НЕ ПОЛОЖИТЬСЯ НА УМОЛЧАНИЕ ЯДРА — ЗАМЕРЕНО, А НЕ ВЫЧИТАНО. Чтение
 * кода вводит в заблуждение: `_get_approval_mode` кончается на
 * `.get("mode", "manual")`, и по исходнику кажется, что без ключа будет
 * `manual`. На деле оно читает УЖЕ СЛИТЫЙ конфиг, а в шаблоне умолчаний ядра
 * стоит `"mode": "smart"` — то есть запасное значение не срабатывает никогда.
 * Прогон `node runtime/execution-boundary.mjs` на профиле без блока
 * `approvals:` печатает `smart` (замерено 2026-09-07).
 *
 * Цена этого была бы двойной: разрушающую команду подтверждала бы модель
 * вместо человека (R21 говорит «человеком»), а наш экран настроек показывал бы
 * при этом `manual` — наш `parseApprovalsMode` без блока отвечает именно так.
 * То есть не отказ, а уверенный неверный ответ про настройку безопасности.
 *
 * Выбор человека не трогается: `applyConfigDefault` дописывает ключ только
 * когда его нет, а наш экран настроек (задача 0.17) правит его же.
 */
function applyApprovalsMode(homeDir: string): void {
  applyConfigDefault(homeDir, 'approvals', 'mode', 'manual', 'the approvals mode')
}

/**
 * Задача 3E.13 (UR38) — ДОСКА ЗАДАЧ, КОТОРОЙ УПРАВЛЯЕТ АГЕНТ.
 *
 * Их ядро прячет инструменты доски от обычного разговора НАМЕРЕННО, и это
 * записано их же словами: «Humans running `hermes chat` without the kanban
 * toolset see zero kanban tools» (`tools/kanban_tools.py::_check_kanban_mode`).
 * Дверей к доске у них ровно две: рабочий, порождённый диспетчером
 * (`HERMES_KANBAN_TASK` + проверка владения), либо профиль, у которого
 * `kanban` записан в `toolsets`. Первая дверь — про их флот воркеров, у нас
 * такого хоста нет; вторая — наша.
 *
 * ЗАМЕРЕНО, А НЕ ВЫЧИТАНО (`node runtime/kanban-probe.mjs`, 2026-09-07). До
 * этой записи: REST доски отвечал `200` и без единого включения, набор
 * `kanban` стоял среди 22 включённых у десктопной сессии, — а агент на прямую
 * просьбу завести задачу отвечал «я не вижу инструмента kanban_create», и в
 * ходе не было НИ ОДНОГО вызова инструмента. То есть доска у нас была
 * читаемой и мёртвой: UR38 говорит «канбан, которым агент управляет сам».
 *
 * ЧТО ЭТО ОТКРЫВАЕТ И ЧЕГО НЕ ОТКРЫВАЕТ. Ключ `toolsets` в их конфиге читает
 * ровно один потребитель — этот шлюз доски (второй, `hermes_cli/dump.py`, это
 * диагностика). Список ВКЛЮЧЁННЫХ наборов считается в другом месте и по
 * другим ключам (`_load_enabled_toolsets`: `HERMES_TUI_TOOLSETS` и рабочая
 * поза), поэтому запись сюда ничего не сужает — проверено отдельно, потому
 * что ровно так нас однажды подвёл `platform_toolsets` (замечание D-66:
 * десктопная сессия получала 8 наборов вместо 19).
 *
 * ЦЕНУ НАЗЫВАЮ ЧЕСТНО. Вместе с жизненным циклом задачи открывается и
 * `_check_kanban_orchestrator_mode` — `kanban_list` и `kanban_unblock`, то
 * есть маршрутизация доски целиком. У них эта поверхность принадлежит
 * профилям-оркестраторам (`techlead`), а не собеседнику человека. Для нас это
 * и есть требование: доской управляет тот же агент, с которым человек
 * разговаривает, — другого у продукта нет.
 *
 * `hermes-cli` в списке — их собственное умолчание (`config_defaults.py`), и
 * оно остаётся: мы ДОБАВЛЯЕМ набор, а не подменяем список. Свой блок
 * `toolsets:` человека не трогается вовсе — правило то же, что у всех
 * умолчаний выше.
 *
 * ЭТОТ КЛЮЧ НЕ ВКЛЮЧАЕТ ИНСТРУМЕНТЫ МОДЕЛИ — он открывает доску, и только.
 * Замерено при задаче 3E.19: попытка добавить сюда третий набор (`video`) не
 * изменила НИ ОДНОГО предложенного инструмента. Причина в том же, что написано
 * выше: список наборов модели считает `_get_platform_tools`, а он читает
 * `platform_toolsets`, а не `toolsets`. Соседняя функция ниже — про тот ключ.
 */
function applyKanbanToolset(homeDir: string): void {
  const configPath = join(homeDir, 'config.yaml')

  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to apply the kanban toolset', error)
    return
  }

  const merged = ensureTopLevelList(original, 'toolsets', ['hermes-cli', 'kanban'])
  if (!merged.changed) return

  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml with the kanban toolset', error)
  }
}

/**
 * Задача 3E.19 — понимание видео предложено модели (SPEC UR33, решение
 * владельца 2026-09-08).
 *
 * ПОЧЕМУ ЭТО НЕ ОДНА СТРОКА В СОСЕДНЕЙ ФУНКЦИИ. У ядра есть список наборов,
 * выключенных по умолчанию (`_DEFAULT_OFF_TOOLSETS`,
 * `hermes_cli/tools_config.py:159`): `video`, `video_gen`, `spotify`,
 * `discord`, `discord_admin`, `homeassistant`, `x_search`, `a2a`. Такой набор
 * выживает фильтрацию ТОЛЬКО будучи названным явно — их словами, «anything the
 * user explicitly listed … must survive», — и «явно» означает `platform_toolsets`,
 * потому что именно его читает `_get_platform_tools`. Ключ `toolsets` к
 * инструментам модели отношения не имеет (см. выше).
 *
 * И ЭТО ТОТ САМЫЙ КЛЮЧ, КОТОРЫЙ ОДНАЖДЫ ОБРЕЗАЛ НАС С 19 НАБОРОВ ДО 8
 * (замечание D-66): он задаёт СПИСОК РАЗРЕШЁННОГО. Поэтому рядом с `video`
 * обязателен `hermes-cli` — их разбор «смешанного списка» тогда берёт наш явный
 * набор И разворачивает их составной, вместо того чтобы оставить один наш.
 * Цена записана тестом рядом: пропажа `hermes-cli` из этого списка — поломка.
 *
 * ЗАМЕРЕНО ДО И ПОСЛЕ, инструментами модели, а не наборами: 53 предложенных
 * инструмента → 54, ни один не пропал, добавился ровно `video_analyze`
 * (в собранном виде каталог к тому же переходит на их мост `tool_search` —
 * это их механизм для больших каталогов, а не потеря). Генерация видео
 * (`video_gen`) остаётся выключенной: её исключает SPEC HX11 поимённо, и в
 * список она не попадает.
 */
function applyVideoToolset(homeDir: string): void {
  const configPath = join(homeDir, 'config.yaml')

  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to apply the video toolset', error)
    return
  }

  const merged = ensureSectionList(original, 'platform_toolsets', 'cli', ['hermes-cli', 'video'])
  if (merged.unexpectedStructure) {
    console.warn(
      'aecpilot: config.yaml has a platform_toolsets: scalar — leaving the video toolset alone'
    )
    return
  }
  if (!merged.changed) return

  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml with the video toolset', error)
  }
}

/**
 * Замечание D-67 — SPEC HX19 в силе НЕ ТОЛЬКО НА БУМАГЕ.
 *
 * HX19 (решение владельца 2026-09-05) говорит: «Ответ агента вслух (`tts_tool`)
 * … не входит в объём». Реестр инструментов записывает `text_to_speech` как
 * исключённый по HX19 — а замер показывал обратное: свежий профиль отдавал
 * десктопной сессии набор `tts` среди 22 включённых, то есть инструмент был
 * предложен модели. Исключение, записанное только в документе, — это не
 * исключение.
 *
 * ПОЧЕМУ ИМЕННО `agent.disabled_toolsets`. У ядра есть второй ключ,
 * `platform_toolsets`, и он выглядит подходящим — но именно он однажды тихо
 * обрезал нашего агента с 19 наборов до 8 (замечание D-66), потому что задаёт
 * СПИСОК РАЗРЕШЁННЫХ, а не запрет. `disabled_toolsets` вычитается ПОСЛЕ всех
 * правил (`hermes_cli/tools_config.py`: «This runs last so it overrides
 * everything above») и трогает ровно названный набор.
 *
 * ЧЕГО ЭТО НЕ ДЕЛАЕТ И ЧТО ОСТАЁТСЯ ВОПРОСОМ. Речь тут только об ИНСТРУМЕНТЕ
 * модели. Голосовая поверхность самого окна (кнопка «прочитать вслух» у ответа,
 * авточтение, непрерывный разговор — задача 3.7a, `lib/voice-playback.ts`) идёт
 * не через инструмент, а прямо в `/api/audio/speak-stream`, и этой правкой не
 * затрагивается. Она противоречит той же HX19, и это отдельная находка D-72:
 * снимать делённую поверхность — решение владельца, а не правка по дороге.
 *
 * ВТОРОЙ ВЫЧИТАЕМЫЙ НАБОР — `project` (задача 3E.20, решение владельца
 * 2026-09-08, SPEC HX23). В нём ровно один инструмент, `desktop_project`: он
 * даёт АГЕНТУ создавать «Проекты» ядра и переключаться между ними, а шлюз при
 * этом переносит рабочую папку живой сессии. Основание исключения — граница
 * источников R7: переключая проект, агент менял бы и рабочую папку, и набор
 * видимых ему источников, то есть сам расширял бы себе доступ к файлам.
 *
 * Почему это вообще потребовалось вычитать: набор приходит не из нашего
 * конфига, а из их `_gui_surface_toolsets` — шлюз добавляет «поверхностные»
 * наборы десктопной сессии сам, и замер 2026-09-08 показал `project` среди 21
 * включённого. Наши собственные каналы `project:*` к этому отношения не имеют и
 * продолжают работать: исключается инструмент МОДЕЛИ, а не поверхность проекта.
 *
 * Выбор человека не трогается: свой блок `agent.disabled_toolsets` переживает
 * все следующие запуски.
 */
function applyDisabledToolsets(homeDir: string): void {
  const configPath = join(homeDir, 'config.yaml')

  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to apply the disabled toolsets', error)
    return
  }

  const merged = ensureSectionList(original, 'agent', 'disabled_toolsets', ['tts', 'project'])
  if (merged.unexpectedStructure) {
    console.warn('aecpilot: config.yaml has an agent: scalar — leaving the disabled toolsets alone')
    return
  }
  if (!merged.changed) return

  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml with the disabled toolsets', error)
  }
}

/** Задача 3.7b — слово-активатор в `config.yaml`, если его там нет.
 *
 * Их умолчание называет ИХ продукт, и оно попадает не в код, а на экран: фразу
 * показывает подпись кнопки и подсказка слэш-команды, беря её из ответа ядра.
 * То есть без этой правки требование C12 («имени чужого продукта в интерфейсе
 * нет») обходится с той стороны, с которой его не сторожит ни один тест
 * каталога — через данные.
 *
 * Как и с голосом: однажды выбранная человеком фраза переживает все следующие
 * запуски, а неудача здесь никогда не блокирует старт. */
function applyDefaultWakePhrase(homeDir: string): void {
  const configPath = join(homeDir, 'config.yaml')

  let original: string
  try {
    original = readFileSync(configPath, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not read config.yaml to apply the wake phrase', error)
    return
  }

  const merged = ensureSectionScalar(original, 'wake_word', 'phrase', DEFAULT_WAKE_PHRASE)
  if (merged.unexpectedStructure) {
    console.warn('aecpilot: config.yaml has a wake_word: scalar — leaving the phrase untouched')
    return
  }
  if (!merged.changed) return

  try {
    writeFileSync(configPath, merged.text, 'utf-8')
  } catch (error: unknown) {
    console.error('aecpilot: could not write config.yaml with the wake phrase', error)
  }
}

/** Builds the spawn-env override for `startServe` (task 0.15, extended to a
 * provider map by 1.6.B2.5): every stored credential env var that decrypts on
 * this machine. SECURITY: the decrypted values live in this object only long
 * enough to be handed to `startServe`'s child_process spawn — never logged,
 * never returned from here to anything but that call. */
function buildExtraEnv(): Record<string, string> {
  return buildProviderKeyEnv()
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
        ...(project ? { cwd: project.vaultPath } : {}),
        ...(sessionProfile ? { profile: sessionProfile } : {})
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

/** Окна, открытые НА КОНКРЕТНОЙ сессии (задача 3.14). Их контракт говорит
 * «открыть ИЛИ показать»: второй вызов на ту же сессию обязан поднять уже
 * открытое окно, иначе кнопка плодит копии одного разговора. */
const sessionWindows = new Map<string, BrowserWindow>()

/** Вынесенные вкладки браузера (задача 3E.5, UR31). Тот же контракт «открыть
 * ИЛИ показать»: второе нажатие на ту же вкладку поднимает её окно, а не
 * плодит копии одной страницы. Закрытие окна возвращает вкладку в панель —
 * их сторона слушает `browser-popout:closed` и приставляет её обратно.
 */
const browserWindows = new Map<string, BrowserWindow>()

/** Задача 3E.11 (UR35). «В каких чатах прямо сейчас идёт ход» — по окнам.
 *
 * Знает об этом только окно, а перехватить выход может только главный процесс;
 * карта и есть мост между ними. Ключ — `webContents.id`, потому что окон может
 * быть несколько и одну сессию видно из двух сразу. */
const activeWorkByWindow = new Map<number, ActiveWork>()

function createWindow(plan: WindowPlan = planAppWindow()): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: process.env.AEC_SMOKE !== '1',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Задача 3E.5 (UR31). Выключатель, который держал HX13: без него
      // `<webview>` в панели предпросмотра существует, но мёртв. HX13
      // отменён решением владельца 05.09.2026, и цена названа в самой
      // записи — произвольная страница становится входом в контекст
      // агента. Поэтому включается он ПОСЛЕ 3E.4, а не вместе с ней:
      // текст страницы приходит модели в рамке «данные, не инструкции»,
      // а уход за пределы источника спрашивает человека
      // (`preview-nav-policy.ts`, подключён ниже к гостю).
      //
      // Три другие настройки НЕ ослабляются и остаются под тем же
      // стражем e2e: гость живёт в своём процессе, а не в нашем.
      webviewTag: true
    }
  })

  // Задача 3.29. Падение САМОГО процесса окна их аварийный экран поймать не
  // может — он умирает вместе с ним. Здесь остаётся единственный след, и без
  // него «окно вдруг стало пустым» не отличить ни от чего другого.
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(
      `aecpilot: renderer process gone (${details.reason}, exitCode ${details.exitCode})`
    )
  })

  win.webContents.on('unresponsive', () => console.warn('aecpilot: renderer unresponsive'))

  // Задача 3E.11. Запрет F12, если человек его включил. Гасится ровно эта
  // клавиша и ровно здесь — до того, как её увидит Chromium.
  win.webContents.on('before-input-event', (event, input) => {
    if (shouldBlockDevtoolsKey(input, isDevtoolsBlocked())) event.preventDefault()
  })

  // Задача 3E.11. Сводка «в каких чатах идёт ход» приходит из окна и живёт до
  // его смерти: сводка мёртвого окна, оставшаяся в карте, спрашивала бы о
  // работе, которой давно нет.
  win.webContents.once('destroyed', () => {
    activeWorkByWindow.delete(win.webContents.id)
    // Задача 3E.8: оболочки этого окна закрываются вместе с ним. Иначе
    // после закрытия остались бы живые `cmd.exe`, о которых никто не знает.
    disposeTerminalsOfWindow(win.webContents.id)
  })

  // Задача 3E.10: координаты правого клика и факты орфографии — то, что видит
  // только главный процесс.
  installContextMenuBridge(win)

  // Задача 3E.5 (UR31): жесты «назад/вперёд» боковыми кнопками мыши и свайпом.
  // Без перехвата Chromium применил бы их к документу САМОГО приложения.
  installBrowserNavGestures(win)

  // Task 3.26: the saved interface scale applies to every window, including a
  // second one opened later, and Ctrl +/-/0 changes it from anywhere.
  applyZoom(win.webContents)
  installZoomShortcuts(win)

  // Task 1.6.4a — the window itself must never leave the app. Since task 1.6.4
  // the transcript renders agent-authored markdown, so a link in that text is
  // content we did not write; a navigation would carry our preload API onto a
  // foreign page. Both escape routes are closed here, and a legitimate web
  // link is handed to the OS browser instead of being followed in place.
  const ownUrl = process.env.ELECTRON_RENDERER_URL ?? rendererFileUrl()

  win.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideExternalLink(url)
    if (decision.allowed) void shell.openExternal(decision.url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isOwnRendererUrl(url, ownUrl)) return
    event.preventDefault()
    const decision = decideExternalLink(url)
    if (decision.allowed) void shell.openExternal(decision.url)
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

  // Вид окна их рендерер читает из строки запроса ДО маршрутизатора, поэтому
  // параметры передаются загрузчику по отдельности, а не склеиваются в адрес
  // (задача 3.14, разбор — `windows-pure.ts`).
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(windowUrl(process.env.ELECTRON_RENDERER_URL, plan))
  } else {
    // Пустые `query`/`hash` НЕ передаются: они меняют адрес окна (`index.html?#/`
    // вместо `index.html`), а главное окно должно открываться ровно тем адресом,
    // которым открывалось до появления второго.
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      ...(Object.keys(plan.query).length === 0 ? {} : { query: plan.query }),
      ...(plan.hash === '' ? {} : { hash: plan.hash })
    })
  }

  return win
}

/** The packaged entry point as a URL, so `will-navigate` can tell "our own
 * page" from anywhere else in the same `file:` scheme. */
function rendererFileUrl(): string {
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

/** Opens a link from the transcript in the OS browser (task 1.6.4a). The
 * renderer asks; the decision is made here, because the renderer is the side
 * that displays untrusted text. */
ipcMain.handle('shell:open-external', async (_event, payload: unknown) => {
  const url =
    typeof payload === 'object' && payload !== null ? (payload as { url?: unknown }).url : undefined
  const decision = decideExternalLink(url)
  if (!decision.allowed) return { ok: false, error: decision.reason }
  try {
    await shell.openExternal(decision.url)
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

/** Task 3.7a — the donor's recorder asks this BEFORE opening the microphone,
 * so a refusal by the OS becomes a sentence ("доступ к микрофону запрещён")
 * instead of a `NotAllowedError` thrown out of `getUserMedia`.
 *
 * macOS is the only platform with a prompt, and asking there is the point: the
 * first recording is what triggers the system dialog. Elsewhere the status is
 * read, never prompted. */
ipcMain.handle('media:request-microphone', async () => {
  if (process.platform === 'darwin') {
    return systemPreferences.askForMediaAccess('microphone')
  }
  try {
    return decideMicrophoneAccess(systemPreferences.getMediaAccessStatus('microphone'))
  } catch {
    // Not implemented on this platform (Linux). Not knowing is not a refusal —
    // Chromium still gets to decide when the capture actually starts.
    return true
  }
})

// --- Streaming speech (task 3.7a) -------------------------------------------
//
// The socket to `/api/audio/speak-stream` is main's, because the credential
// that opens it is the gateway's whole session token (SPEC C9; see
// `speech-stream-pure.ts`). These three handlers are the entire renderer-facing
// surface: name a stream, feed it one of their three frame shapes, close it.

/** Windows whose teardown already closes their streams — one listener each,
 * not one per opened stream. */
const speechCleanupHooked = new Set<number>()

ipcMain.handle('speech:open', (event, id: unknown) => {
  if (!isValidStreamId(id)) return { ok: false, error: 'неверный идентификатор потока речи' }

  const sender = event.sender
  const key = streamKey(sender.id, id)

  // A reload or a closed window leaves the backend synthesizing into nothing.
  if (!speechCleanupHooked.has(sender.id)) {
    speechCleanupHooked.add(sender.id)
    sender.once('destroyed', () => {
      speechCleanupHooked.delete(sender.id)
      closeSpeechStreamsFor(sender.id)
    })
  }

  return openSpeechStream(key, restTarget(), (partial) => {
    if (sender.isDestroyed()) return
    sender.send('speech:event', { ...partial, id })
  })
})

ipcMain.handle('speech:send', (event, payload: unknown) => {
  const { id, frame } =
    typeof payload === 'object' && payload !== null
      ? (payload as { id?: unknown; frame?: unknown })
      : {}
  if (!isValidStreamId(id)) return { ok: false, error: 'неверный идентификатор потока речи' }

  return sendSpeechFrame(streamKey(event.sender.id, id), frame)
})

ipcMain.handle('speech:close', (event, id: unknown) => {
  if (!isValidStreamId(id)) return
  closeSpeechStream(streamKey(event.sender.id, id))
})

// --- Artifacts: files on disk (tasks 1.6.B7.4/B7.5) -------------------------
//
// An artifact path is a string a language model wrote, so the three handlers
// below are deliberately unequal in what they grant:
//
//   `artifacts:stat`    — does it exist, is it inside the project. Read-only.
//   `artifacts:reveal`  — highlights it in the OS file manager. Selects; does
//                         not launch. Allowed outside the project too — the
//                         user asked to be shown where a file is.
//   `artifacts:preview` — reads BYTES and hands them to the window. Fenced to
//                         the project, capped in size, raster formats only.
//
// What is deliberately NOT here is "open with the OS default application".
// `shell.openPath` on a model-authored path is an arbitrary-file-open — and,
// for anything executable, arbitrary code execution — primitive; the same
// reasoning already keeps `file:` out of `decideExternalLink`'s allow-list, and
// the explorer this app already ships offers reveal, not launch. A LINK
// artifact opens through `shell:open-external`, which validates the scheme.

ipcMain.handle('artifacts:stat', async (_event, value: unknown) => {
  // Задача 3.13b. Артефакт — файл, который создал агент; при удалённом ядре он
  // лежит там же, где агент работал. Проверять его наличие здесь бессмысленно:
  // ответ был бы про чужой диск.
  if (filesAreRemote()) {
    const path = typeof value === 'string' ? value : ''
    if (path === '') return { ok: false, error: 'Пустой путь' }
    const info = await statRemoteFile(restTarget(), path)
    return {
      ok: true,
      exists: info.exists,
      isFile: info.isFile,
      size: info.size,
      // «Внутри проекта» — понятие этой машины; на той стороне проекта в нашем
      // смысле нет, и притворяться, что есть, значило бы обещать проверку,
      // которой не делается.
      insideProject: false,
      previewable: info.exists && info.isFile && isPreviewableImage(path)
    }
  }

  const resolved = resolveArtifactPath(currentProject?.vaultPath, value)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  try {
    const info = await fs.promises.stat(resolved.absPath)
    return {
      ok: true,
      exists: true,
      isFile: info.isFile(),
      size: info.size,
      insideProject: resolved.insideProject,
      previewable: resolved.insideProject && info.isFile() && isPreviewableImage(resolved.absPath)
    }
  } catch {
    // A missing file is an ANSWER here, not a failure: the tab marks the row
    // rather than hiding it, so the user learns the agent's file is gone.
    return {
      ok: true,
      exists: false,
      isFile: false,
      size: 0,
      insideProject: resolved.insideProject,
      previewable: false
    }
  }
})

ipcMain.handle('artifacts:reveal', async (_event, value: unknown) => {
  // «Показать в проводнике» при удалённом ядре не значит ничего: проводник
  // открылся бы на ЭТОЙ машине, где файла нет. Решение 3.13a — выключить и
  // объяснить, а не открывать пустую папку.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }

  const resolved = resolveArtifactPath(currentProject?.vaultPath, value)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  try {
    await fs.promises.stat(resolved.absPath)
  } catch {
    return { ok: false, error: 'Файла нет на диске — возможно, он был удалён или переименован' }
  }
  shell.showItemInFolder(resolved.absPath)
  return { ok: true }
})

ipcMain.handle('artifacts:preview', async (_event, value: unknown) => {
  if (filesAreRemote()) {
    const path = typeof value === 'string' ? value : ''
    if (path === '') return { ok: false, error: 'Пустой путь' }
    if (!isPreviewableImage(path)) {
      return { ok: false, error: 'Предпросмотр умеет только растровые картинки' }
    }
    // Размер ограничивает ядро (`_FS_DATA_URL_MAX_BYTES`), и его отказ приходит
    // сюда словами — своего предела мы не заводим: два предела на одну картинку
    // разошлись бы при первом же обновлении ядра.
    return readRemoteDataUrl(restTarget(), path)
  }

  const resolved = resolveArtifactPath(currentProject?.vaultPath, value)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  if (!resolved.insideProject) return { ok: false, error: PREVIEW_OUTSIDE_PROJECT_ERROR }
  if (!isPreviewableImage(resolved.absPath)) {
    return { ok: false, error: 'Предпросмотр умеет только растровые картинки' }
  }
  try {
    // The containment check above is lexical; `realpath` closes the symlink
    // hole — a link inside the vault pointing anywhere on disk would otherwise
    // read those bytes into the window. Same layering as `vault-fs.ts`.
    const realPath = await fs.promises.realpath(resolved.absPath)
    if (!isInside(currentProject?.vaultPath, realPath)) {
      return { ok: false, error: PREVIEW_OUTSIDE_PROJECT_ERROR }
    }
    const info = await fs.promises.stat(realPath)
    if (!info.isFile()) return { ok: false, error: 'Это не файл' }
    if (info.size > PREVIEW_MAX_BYTES) {
      return {
        ok: false,
        error: `Картинка больше ${Math.round(PREVIEW_MAX_BYTES / (1024 * 1024))} МБ — откройте её в проводнике`
      }
    }
    const bytes = await fs.promises.readFile(realPath)
    return { ok: true, dataUrl: `data:${imageMime(realPath)};base64,${bytes.toString('base64')}` }
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Не удалось прочитать файл: ${error instanceof Error ? error.message : String(error)}`
    }
  }
})

// Задача 3E.25 (SPEC UR22, замечание D-75). Их панель перерисовывается сама,
// когда файл на диске изменился, и ждёт для этого трёх членов моста. Решение,
// за чем можно следить, — в `preview-watch-pure.ts`; здесь диск и отказы.
//
// ОТКАЗ СЛОВАМИ, А НЕ ТИШИНОЙ: их эффект ловит исключение и печатает причину в
// консоль панели (`copy.watchFailed`), поэтому отказ поднимается ошибкой, а не
// возвращается пустым наблюдателем, который никогда ничего не пришлёт.
ipcMain.handle('preview:watch', async (event, value: unknown) => {
  if (filesAreRemote()) {
    // Файл лежит на машине ядра, и `fs.watch` этой машины смотрел бы на пустое
    // место — или, хуже, на СВОЙ файл с тем же путём.
    return { ok: false, error: 'Файлы на машине ядра — следить за ними отсюда нечем' }
  }

  const decided = decideWatch(currentProject?.vaultPath, value, wasPickedByUser)
  if (!decided.ok) return { ok: false, error: decided.error }

  try {
    // Проверка выше лексическая; `realpath` закрывает дыру со ссылкой — ссылка
    // внутри проекта, ведущая наружу, иначе дала бы слежение за чужим файлом.
    // Слой тот же, что у `artifacts:preview`.
    const realPath = await fs.promises.realpath(decided.absPath)
    if (!realPathAllowed(currentProject?.vaultPath, realPath, wasPickedByUser)) {
      return { ok: false, error: WATCH_OUTSIDE_ERROR }
    }

    const info = await fs.promises.stat(realPath)
    if (!info.isFile()) return { ok: false, error: 'Это не файл' }

    return { ok: true, watch: startPreviewWatch(realPath, event.sender) }
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Не удалось начать слежение: ${error instanceof Error ? error.message : String(error)}`
    }
  }
})

// Задача 3E.31 (замечание D-79, решение владельца 2026-09-09). Сохранение
// правки в ИХ редакторе предпросмотра (`preview-file.tsx`). До этого член
// `writeTextFile` мост не отдавал, и их «Сохранить» отвечало внутренней
// ошибкой вместо работы: заглушка непроброшенного члена истинна на вид, их же
// честная ветка «сохранение недоступно» до человека не доходила.
//
// Что можно писать — в `preview-write-pure.ts`; здесь диск и отказы. Взят ОДИН
// член из трёх (D-79): `renamePath` и `trashPath` остаются непроброшенными.
ipcMain.handle('preview:write-text', async (_event, payload: unknown) => {
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }

  const value = payload as { content?: unknown; path?: unknown } | null
  if (typeof value?.content !== 'string') return { ok: false, error: 'Нечего сохранять' }

  const decided = decideWrite(currentProject?.vaultPath, value.path, wasPickedByUser)
  if (!decided.ok) return { ok: false, error: decided.error }

  try {
    // Файл обязан УЖЕ БЫТЬ. Редактор сохраняет то, что открыл, и создание
    // файла ему не нужно ни разу; `realpath` заодно закрывает дыру со ссылкой
    // наружу — на несуществующем пути он и отвечает отказом.
    const realPath = await fs.promises.realpath(decided.absPath)
    if (!realPathWritable(currentProject?.vaultPath, realPath, wasPickedByUser)) {
      return { ok: false, error: WRITE_OUTSIDE_ERROR }
    }

    const info = await fs.promises.stat(realPath)
    if (!info.isFile()) return { ok: false, error: 'Это не файл' }

    await fs.promises.writeFile(realPath, value.content, 'utf8')

    return { ok: true, path: realPath }
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Не удалось сохранить: ${error instanceof Error ? error.message : String(error)}`
    }
  }
})

ipcMain.handle('preview:stop-watch', (_event, id: unknown) =>
  typeof id === 'string' ? stopPreviewWatch(id) : false
)

/** Тестовая ручка: сколько наблюдателей живо. Нужна e2e «повторное открытие их
 *  не копит» — утечку иначе пришлось бы ловить по памяти процесса. */
ipcMain.handle('preview:watch-count', () => previewWatchCount())

// Задача 3E.25. Путь, названный человеком или агентом, приводится к абсолютному
// ЗДЕСЬ, потому что правила путей знает node, а не окно: их собственный
// запасной разбор (`lib/local-preview.ts`) приклеивает рабочую папку ко всему,
// что не начинается со `/`, — то есть на Windows ломает `D:\отчёт.html`.
// Классификацию (текст / html / картинка / pdf) оставляем ИХ таблице: она у них
// есть, и вторая такая же рядом разошлась бы с первой.
ipcMain.handle('preview:resolve-target', (_event, payload: unknown) => {
  const { target, baseDir } = (payload ?? {}) as { baseDir?: unknown; target?: unknown }
  const root = typeof baseDir === 'string' && baseDir !== '' ? baseDir : currentProject?.vaultPath
  const resolved = resolveArtifactPath(root, target)

  return resolved.ok
    ? { ok: true, absPath: resolved.absPath }
    : { ok: false, error: resolved.error }
})

// The composer's one way in. Since hermes 0.19.0 the answer matters: a prompt
// sent mid-turn is no longer refused but QUEUED (or steered), and the caller is
// the one that tells the user which happened (task 1.6.B5.26).
//
// `truncateBeforeUserOrdinal` (task 1.6.B5.27) re-runs from an edited message.
// It is validated as a non-negative integer here rather than passed through:
// their handler rejects a negative value with 4018 precisely because Python's
// negative indexing would otherwise truncate the session to its last turn, and
// this app should not be the thing that gets close to that.
ipcMain.handle('chat:submit', async (_event, payload: unknown) => {
  const raw =
    typeof payload === 'string'
      ? { text: payload }
      : ((payload ?? {}) as {
          text?: unknown
          truncateBeforeUserOrdinal?: unknown
        })
  const text = raw.text
  if (typeof text !== 'string') throw new Error('invalid prompt text')
  const ordinal = raw.truncateBeforeUserOrdinal
  if (ordinal !== undefined && ordinal !== null) {
    if (typeof ordinal !== 'number' || !Number.isInteger(ordinal) || ordinal < 0) {
      throw new Error('invalid message ordinal')
    }
  }
  const activeSessionId = await ensureSession()
  if (!gateway) throw new Error('cannot submit prompt — gateway is not connected')
  return gateway.request('prompt.submit', {
    session_id: activeSessionId,
    text,
    ...(typeof ordinal === 'number' ? { truncate_before_user_ordinal: ordinal } : {})
  })
})

// --- Quick entry: the global-hotkey capture window (task 3.15) --------------
//
// Its window has no gateway of its own and no session state; it hands text
// here, and here it goes through the SAME `prompt.submit` the composer uses.
// "New session" is the ordinary create-then-submit, so a prompt captured from
// another app lands exactly where the same words typed in the app would.

ipcMain.handle('quick:submit', async (_event, payload: unknown) => {
  const { text, target } =
    typeof payload === 'object' && payload !== null
      ? (payload as { text?: unknown; target?: unknown })
      : {}

  if (typeof text !== 'string' || text.trim() === '')
    return { ok: false, error: 'пустое сообщение' }
  if (!isQuickEntryTarget(target)) return { ok: false, error: 'неизвестная цель отправки' }
  if (!gateway) return { ok: false, error: 'нет связи со шлюзом' }
  if (!currentProject) return { ok: false, error: 'проект не открыт' }

  try {
    if (target === 'new') await newSession()
    const activeSessionId = await ensureSession()
    await gateway.request('prompt.submit', { session_id: activeSessionId, text })
    // The answer arrives in the main window, so bring it forward — otherwise a
    // prompt fired from another app looks like it went nowhere.
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.getURL().includes('quick-entry')) continue
      win.show()
    }

    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.on('quick:hide', () => hideQuickEntry())

/** Task 3.18. Their settings row mirrors the preference into the renderer's own
 * storage and calls this; main keeps its own copy because the blocker has to be
 * back in force after a restart without anyone visiting Settings. */
// Task 3.26 (SPEC HX14). Zoom is accessibility, not decoration — an engineer
// reads drawings for hours. Main owns it: the level lives on `webContents`,
// survives a restart and must be the same in every window.
ipcMain.handle('zoom:get', () => ({
  level: levelForPercent(zoomPercent()),
  percent: zoomPercent()
}))

ipcMain.handle('zoom:set-percent', (_event, percent: unknown) => setZoomPercent(percent))

// Язык ответов агента — третий уровень SPEC G7 (задача 5.14). Настройка
// ПОЛЬЗОВАТЕЛЬСКАЯ и видимая; строка в SOUL нового специалиста дописывается из
// неё на проходе `profiles.create` (см. обработчик `gateway:rpc`).
ipcMain.handle('agent-language:get', () => ({ language: loadAgentLanguage() }))

ipcMain.handle('agent-language:set', (_event, language: unknown) => ({
  language: saveAgentLanguage(language)
}))

ipcMain.handle('power:keep-awake', (_event, on: unknown) => {
  if (typeof on !== 'boolean') return { enabled: loadKeepAwake() }

  return { enabled: setKeepAwake(on) }
})

// Slash-command completions for the composer (task 1.6.8). Read-only and
// best-effort by design: this fires on every keystroke after "/", so a
// disconnected gateway or a slow answer must degrade to "no suggestions"
// rather than surface an error over the composer.
ipcMain.handle('chat:complete-slash', async (_event, text: unknown) => {
  if (typeof text !== 'string' || !gateway) return { items: [] }
  try {
    return await gateway.request('complete.slash', { text })
  } catch (error: unknown) {
    console.error('aecpilot: complete.slash failed', error)
    return { items: [] }
  }
})

// --- Attachments (task 1.6.A4) ---------------------------------------------
// The list itself lives in the gateway session; these calls only add to and
// remove from it, and report the count back so the composer mirrors the truth
// rather than keeping a second copy that could drift.
//
// Errors are returned, not thrown: attaching is one of the places where a
// refusal is normal and informative (no image in the clipboard, no poppler for
// a PDF), and a rejected IPC call would surface as a bare stack trace.
type AttachOutcome = { ok: true; path?: string; count: number } | { ok: false; error: string }

async function attachViaGateway(method: 'image.attach' | 'pdf.attach', path: string) {
  if (!gateway) return { ok: false as const, error: 'нет связи со шлюзом' }
  const activeSessionId = await ensureSession()
  try {
    const result = await gateway.request(method, { session_id: activeSessionId, path })
    if (!result.attached) {
      return { ok: false as const, error: result.message ?? 'вложение не принято' }
    }
    return { ok: true as const, path: result.path, count: result.count ?? 0 }
  } catch (error: unknown) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Opens the OS picker and attaches what was chosen. The picker runs here
 * because the renderer must never be handed a filesystem path it did not get
 * from the user through a trusted dialog. */
ipcMain.handle('attach:pick', async (event): Promise<AttachOutcome[]> => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return [{ ok: false, error: 'нет окна' }]
  const picked = await dialog.showOpenDialog(window, {
    title: 'Прикрепить к сообщению',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Картинки и PDF', extensions: [...IMAGE_DIALOG_EXTENSIONS, 'pdf'] },
      { name: 'Все файлы', extensions: ['*'] }
    ]
  })
  if (picked.canceled) return []
  const outcomes: AttachOutcome[] = []
  for (const filePath of picked.filePaths) {
    const kind = classifyAttachment(filePath)
    if (kind === 'unsupported') {
      outcomes.push({ ok: false, error: `не поддерживается: ${basename(filePath)}` })
      continue
    }
    outcomes.push(await attachViaGateway(kind === 'pdf' ? 'pdf.attach' : 'image.attach', filePath))
  }
  return outcomes
})

/** Attaches the image sitting in the OS clipboard. Their handler reads the
 * clipboard on the GATEWAY's host — which is this machine, because this app
 * spawns its own gateway (runtime/serve.mjs). It would be the wrong call for a
 * remote gateway; there their `image.attach_bytes` is the path. */
ipcMain.handle('attach:paste', async (): Promise<AttachOutcome> => {
  if (!gateway) return { ok: false, error: 'нет связи со шлюзом' }
  const activeSessionId = await ensureSession()
  try {
    const result = await gateway.request('clipboard.paste', { session_id: activeSessionId })
    if (!result.attached) return { ok: false, error: result.message ?? 'в буфере нет картинки' }
    return { ok: true, path: result.path, count: result.count ?? 0 }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('attach:detach', async (_event, path: unknown): Promise<{ count: number }> => {
  if (typeof path !== 'string' || !gateway) return { count: 0 }
  const activeSessionId = await ensureSession()
  try {
    const result = await gateway.request('image.detach', { session_id: activeSessionId, path })
    return { count: result.count }
  } catch (error: unknown) {
    console.error('aecpilot: image.detach failed', error)
    return { count: 0 }
  }
})

// `@`-reference completions (task 1.6.A3). Same best-effort contract as the
// slash completions above, and for the same reason. `session_id` is what binds
// the search to the open project's directory — their `_completion_cwd` reads
// the session's cwd, so without it the listing would come from whatever
// directory the gateway process happens to be in.
ipcMain.handle('chat:complete-path', async (_event, word: unknown) => {
  if (typeof word !== 'string' || !gateway) return { items: [] }
  try {
    const activeSessionId = await ensureSession()
    return await gateway.request('complete.path', { word, session_id: activeSessionId })
  } catch (error: unknown) {
    console.error('aecpilot: complete.path failed', error)
    return { items: [] }
  }
})

// --- Model / effort / fast picker (task 1.6.9) -----------------------------
// The catalogue. `refresh` is passed through only when the renderer explicitly
// asks for it: their handler treats it as "re-fetch every provider's live
// catalog and probe custom endpoints", which can block on a slow or offline
// local endpoint, so a normal picker open must not set it.
ipcMain.handle('model:options', async (_event, refresh: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const activeSessionId = await ensureSession()
  return gateway.request('model.options', {
    session_id: activeSessionId,
    // REQUIRED since hermes 0.19.0, and silently so. Up to 0.18.0 their
    // handler forced `include_unconfigured=True` itself; 0.19.0 turned it into
    // a parameter that defaults to FALSE. Measured on the upgrade: without
    // this flag the answer carries 3 providers, with it 41 (38 of them not yet
    // configured, 28 naming the env var their key would go into). Dropping it
    // does not break anything loudly — the provider screen just quietly stops
    // being able to say "нужен ключ XAI_API_KEY", and the picker stops showing
    // the models you could switch to after setting one up.
    include_unconfigured: true,
    ...(refresh === true ? { refresh: true } : {})
  })
})

// The three `config.set` keys this app writes. The allowlist is the point:
// `config.set` also reaches yolo, approvals and display settings, and the
// composer must not become a way to reach those by passing a different key.
const PICKER_CONFIG_KEYS = ['model', 'reasoning', 'fast'] as const
type PickerConfigKey = (typeof PICKER_CONFIG_KEYS)[number]
function isPickerConfigKey(value: unknown): value is PickerConfigKey {
  return typeof value === 'string' && (PICKER_CONFIG_KEYS as readonly string[]).includes(value)
}

ipcMain.handle('model:set-config', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { key, value, confirmExpensive } =
    typeof payload === 'object' && payload !== null
      ? (payload as { key?: unknown; value?: unknown; confirmExpensive?: unknown })
      : {}
  if (!isPickerConfigKey(key)) throw new Error('invalid config key')
  if (typeof value !== 'string') throw new Error('invalid config value')
  const activeSessionId = await ensureSession()
  return gateway.request('config.set', {
    key,
    value,
    session_id: activeSessionId,
    ...(key === 'model' && confirmExpensive === true ? { confirm_expensive_model: true } : {})
  })
})

// --- The standing goal (task 1.6.A5) ---------------------------------------
// Only the four read/control actions. Setting a goal is NOT here: `/goal
// <text>` returns a `send` directive their side expects to be submitted as a
// user turn, which is what typing `/goal …` in the composer already does. A
// second path to it would be a second, divergent implementation of the same
// thing.
const GOAL_ACTIONS = ['status', 'pause', 'resume', 'clear'] as const
type GoalAction = (typeof GOAL_ACTIONS)[number]
function isGoalAction(value: unknown): value is GoalAction {
  return typeof value === 'string' && (GOAL_ACTIONS as readonly string[]).includes(value)
}

ipcMain.handle('goal:dispatch', async (_event, action: unknown) => {
  if (!isGoalAction(action)) throw new Error('invalid goal action')
  // Best-effort like the slash completions: the badge polls this, and a
  // gateway that is down or has no goals module must leave the chat alone
  // rather than raise over it.
  if (!gateway) return { output: '' }
  try {
    const activeSessionId = await ensureSession()
    const result = await gateway.request('command.dispatch', {
      name: 'goal',
      arg: action,
      session_id: activeSessionId
    })
    return { output: result.output ?? '' }
  } catch (error: unknown) {
    console.error('aecpilot: goal dispatch failed', error)
    return { output: '' }
  }
})

// --- Checkpoints / rollback (task 1.6.C2) ----------------------------------
// Contract: specs/checkpoints-rollback.md. Everything below addresses the
// session's cwd (= the open vault) because the gateway offers no directory
// parameter; `checkpointScope()` is what lets the screen explain an empty
// list instead of just showing one.

function checkpointScope(): CheckpointScope | { kind: 'remote' } | { kind: 'unknown' } {
  // Задача 3.13b. Диагноз — это обход ДИСКА в поисках папки-признака. При ядре
  // на другой машине обходить надо её диск, а не наш: наш ответ описывал бы
  // чужую машину с полной уверенностью. Уверенная неправда хуже отказа.
  if (filesAreRemote()) return { kind: 'remote' }
  if (!currentProject) return { kind: 'unknown' }
  try {
    return resolveCheckpointScope(
      resolve(currentProject.vaultPath),
      homedir(),
      (dir) => CHECKPOINT_MARKERS.some((marker) => existsSync(join(dir, marker))),
      dirname
    )
  } catch (error: unknown) {
    // An unreadable/removed vault root must not take the screen down — the
    // list itself may still be answerable.
    console.error('aecpilot: checkpoint scope probe failed', error)
    return { kind: 'unknown' }
  }
}

/** Same shape their `_validate_commit_hash` accepts (4–64 hex). Checking it
 * here means a malformed id never reaches the gateway, and in particular that
 * a plain integer can never get through — their `_resolve_checkpoint_hash`
 * would silently reinterpret one as a 1-based position in the list. */
function isCheckpointHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{4,64}$/.test(value)
}

/** A vault-relative path, mirroring their `_validate_file_path`: non-empty,
 * not absolute, no `..` segment. */
function isRestorableRelPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  if (isAbsolute(value) || /^[a-zA-Z]:/.test(value)) return false
  return !value.split(/[/\\]/).includes('..')
}

ipcMain.handle('rollback:list', async () => {
  if (!gateway) throw new Error('no gateway connection')
  const activeSessionId = await ensureSession()
  const result = await gateway.request('rollback.list', { session_id: activeSessionId })
  return {
    enabled: result.enabled === true,
    checkpoints: Array.isArray(result.checkpoints) ? result.checkpoints : [],
    scope: checkpointScope()
  }
})

ipcMain.handle('rollback:diff', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { hash } = (payload ?? {}) as { hash?: unknown }
  if (!isCheckpointHash(hash)) throw new Error('invalid checkpoint hash')
  const activeSessionId = await ensureSession()
  return gateway.request('rollback.diff', { session_id: activeSessionId, hash })
})

// DESTRUCTIVE: overwrites files in the user's vault. `confirmed` is required
// and is checked here rather than only in the renderer, so there is no way to
// reach a restore without the screen's explicit confirmation step having been
// taken — a bug or a stray call in the renderer cannot skip it.
ipcMain.handle('rollback:restore', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { hash, filePath, confirmed } = (payload ?? {}) as {
    hash?: unknown
    filePath?: unknown
    confirmed?: unknown
  }
  if (confirmed !== true) throw new Error('rollback.restore requires explicit confirmation')
  if (!isCheckpointHash(hash)) throw new Error('invalid checkpoint hash')
  if (filePath !== undefined && !isRestorableRelPath(filePath)) {
    throw new Error('invalid file path')
  }
  const activeSessionId = await ensureSession()
  return gateway.request('rollback.restore', {
    session_id: activeSessionId,
    hash,
    ...(filePath === undefined ? {} : { file_path: filePath })
  })
})

// --- Skills and learning, batch 3 (contract: specs/agent-skills.md) --------
// Split across both transports on purpose, and both choices are measured
// rather than assumed (probe `runtime/skills-probe.mjs`, task 1.6.B3.1):
//   - the skill LIST and the learning GRAPH come over REST, because the RPC
//     list carries only names and `learning.frames` raises on Windows
//     ("Invalid format string" — their `%-d` strftime);
//   - reload, node detail and the two mutations stay on RPC, which is where
//     they work.

ipcMain.handle('skills:list', async () => {
  return hermesRest<SkillRow[]>(restTarget(), '/api/skills')
})

// Enabling/disabling one skill (task 1.6.B3.17, owner decision 2026-07-31).
//
// Over REST, and that is the whole reason this exists: decision B3-2 said "do
// not write skills.disabled" on the premise that the only way would be editing
// their config.yaml by hand, which rule R3 forbids. The premise was wrong —
// `PUT /api/skills/toggle` is their own supported path and writes the same
// key through their own code. The owner reversed the decision once measured.
ipcMain.handle('skills:toggle', async (_event, payload: unknown) => {
  const { name, enabled } = (payload ?? {}) as { name?: unknown; enabled?: unknown }
  if (typeof name !== 'string' || name.trim() === '') throw new Error('invalid skill name')
  if (typeof enabled !== 'boolean') throw new Error('invalid enabled flag')
  const result = await hermesRest<{ ok?: boolean }>(restTarget(), '/api/skills/toggle', {
    method: 'PUT',
    body: { name, enabled }
  })
  // Their toggle writes config and stops there. `skills.reload` re-scans the
  // directories so the slash-command map matches — best-effort, because the
  // config write already succeeded and a reload failure must not be reported
  // as the toggle having failed. Their own comment records that reload does
  // NOT drop the prompt cache, so this costs nothing beyond the re-scan.
  if (gateway) {
    try {
      await gateway.request('skills.reload', {})
    } catch (error: unknown) {
      console.error('aecpilot: skills.reload after a toggle failed', error)
    }
  }
  return result
})

ipcMain.handle('skills:reload', async () => {
  if (!gateway) throw new Error('no gateway connection')
  const result = await gateway.request('skills.reload', {})
  const inner = result.result ?? {}
  return {
    added: (inner.added ?? []).map((item) => item.name ?? '').filter((name) => name !== ''),
    removed: (inner.removed ?? []).map((item) => item.name ?? '').filter((name) => name !== ''),
    total: typeof inner.total === 'number' ? inner.total : 0
  }
})

function isLearningNodeId(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 512
}

ipcMain.handle('learning:detail', async (_event, id: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  if (!isLearningNodeId(id)) throw new Error('invalid node id')
  return gateway.request('learning.detail', { id })
})

// Both mutations check `confirmed` here rather than only in the renderer —
// same rule as `rollback:restore`. Editing overwrites a file the agent reads
// as instructions; deleting either archives a skill or removes a memory chunk
// for good.
ipcMain.handle('learning:edit', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { id, content, confirmed } = (payload ?? {}) as {
    id?: unknown
    content?: unknown
    confirmed?: unknown
  }
  if (confirmed !== true) throw new Error('learning.edit requires explicit confirmation')
  if (!isLearningNodeId(id)) throw new Error('invalid node id')
  if (typeof content !== 'string') throw new Error('invalid content')
  return gateway.request('learning.edit', { id, content })
})

ipcMain.handle('learning:delete', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { id, confirmed } = (payload ?? {}) as { id?: unknown; confirmed?: unknown }
  if (confirmed !== true) throw new Error('learning.delete requires explicit confirmation')
  if (!isLearningNodeId(id)) throw new Error('invalid node id')
  return gateway.request('learning.delete', { id })
})

ipcMain.handle('learning:graph', async () => {
  return hermesRest<LearningGraph>(restTarget(), '/api/learning/graph')
})

ipcMain.handle('curator:status', async () => {
  return hermesRest<CuratorStatus>(restTarget(), '/api/curator')
})

// `/learn <тема>` — the same dispatch path the composer uses for `/goal`. The
// answer is returned verbatim: deciding what to do with a `type` other than
// `send` belongs to the caller, and quietly submitting an unexpected shape as
// a user turn is exactly the failure to avoid.
ipcMain.handle('learn:dispatch', async (_event, topic: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  if (typeof topic !== 'string' || topic.trim() === '') throw new Error('invalid topic')
  const activeSessionId = await ensureSession()
  return gateway.request('command.dispatch', {
    name: 'learn',
    arg: topic,
    session_id: activeSessionId
  })
})

// --- Our own settings that live in the project (tasks 1.6.B2.17–B2.19) -----
// Wiki language, scan interval and embedding model belong to the VAULT, not to
// the app: they travel with the project (specs/workspace-sources.md § Data
// schemas), so they are read from and written to `project.json`.

ipcMain.handle('project:get-settings', () => {
  if (!currentProject) return null
  return getProjectSettings(currentProject.vaultPath) ?? null
})

ipcMain.handle('project:update-settings', (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'нет открытого проекта' }
  const { wikiLang, scanIntervalS, embeddingModel, extractionLanguage } = (payload ?? {}) as {
    wikiLang?: unknown
    scanIntervalS?: unknown
    embeddingModel?: unknown
    extractionLanguage?: unknown
  }
  const patch: Parameters<typeof updateProjectSettings>[1] = {}
  if (wikiLang !== undefined) {
    if (typeof wikiLang !== 'string') return { ok: false, error: 'язык вики должен быть строкой' }
    patch.wiki_lang = wikiLang
  }
  if (scanIntervalS !== undefined) {
    if (typeof scanIntervalS !== 'number' || !Number.isFinite(scanIntervalS)) {
      return { ok: false, error: 'интервал должен быть числом' }
    }
    patch.scan_interval_s = scanIntervalS
  }
  if (embeddingModel !== undefined) {
    if (typeof embeddingModel !== 'string') {
      return { ok: false, error: 'модель эмбеддингов должна быть строкой' }
    }
    patch.embedding_model = embeddingModel
  }
  if (extractionLanguage !== undefined) {
    if (typeof extractionLanguage !== 'string') {
      return { ok: false, error: 'язык извлечения должен быть строкой' }
    }
    patch.extraction_language = extractionLanguage
  }

  const result = updateProjectSettings(currentProject.vaultPath, patch)
  // A changed interval has to reach the running scheduler, otherwise the new
  // value sits in project.json while the old one keeps firing.
  if (result.ok && patch.scan_interval_s !== undefined) {
    startScanSchedulerForProject(currentProject.vaultPath)
  }
  return result
})

// --- MCP servers (tasks 1.6.B2.8–B2.12) ------------------------------------
// There are NO `mcp.*` JSON-RPC methods — measured, not assumed: server CRUD
// exists only on the REST surface of the same `hermes serve` process (owner
// decision R1 allows REST exactly for gaps like this one).
//
// The live connection state is a different source: it rides along on
// `session.info.mcp_servers`, which main already forwards to the renderer.
// Caching it here means the settings screen gets config and liveness in one
// call and does not have to grow a dependency on the chat's state.

let lastMcpStatus: McpLiveStatus[] = []

/** Keeps the newest `session.info.mcp_servers` seen on the active session. */
function rememberMcpStatus(event: GatewayEvent): void {
  if (event.type !== 'session.info') return
  const servers = (event.payload as { mcp_servers?: unknown } | undefined)?.mcp_servers
  if (Array.isArray(servers)) lastMcpStatus = servers as McpLiveStatus[]
}

/** Файлы сейчас на машине ядра, а не на этой (задача 3.13b).
 *
 * Один вопрос на все файловые поверхности. Раньше каждая из них молча
 * предполагала «локально» — и при удалённом ядре показывала бы МЕСТНЫЙ файл с
 * тем же именем: не отказ, а уверенный неверный ответ. */
function filesAreRemote(): boolean {
  return remoteTarget() !== undefined
}

function restTarget(): RestTarget | undefined {
  // Задача 3.12: удалённое ядро отвечает по своему адресу и своим токеном.
  // Проверяется ПЕРВЫМ: когда человек подключился к серверу, локальный процесс
  // мы не поднимаем вовсе, и `serveHandle` пуст — но если бы он остался с
  // прошлого режима, запрос обязан уйти туда, куда человек подключён.
  const remote = remoteTarget()
  if (remote) {
    return { host: '', port: 0, token: remote.token, baseUrl: remote.baseUrl }
  }

  if (serveHandle) {
    return { host: serveHandle.host, port: serveHandle.port, token: serveHandle.token }
  }

  // Режим e2e (задача 3.16). Собственный процесс ядра не поднят, но список
  // сессий у донора идёт по REST, а не по сокету — без этого адреса боковая
  // панель в тесте ПУСТА всегда, и «работает» не отличить от «не доехало».
  // Проверяется последним: живой процесс и удалённое ядро всегда важнее.
  const mockRest = process.env.AEC_GATEWAY_REST_URL
  return mockRest ? { host: '', port: 0, token: '', baseUrl: mockRest } : undefined
}

ipcMain.handle('mcp:list', async () => {
  const result = await hermesRest<{ servers?: McpServerSummary[] }>(
    restTarget(),
    '/api/mcp/servers'
  )
  // `env` VALUES never leave main. Their REST layer already redacts them
  // (`_redact_mcp_env`), but a redacted secret is still a secret's shape, and
  // the screen has no use for either — it shows which variables a server
  // defines, not what they hold.
  const servers = (result.servers ?? []).map((server) => ({
    ...server,
    envNames: Object.keys(server.env ?? {}),
    env: undefined
  }))
  return { servers, live: lastMcpStatus }
})

ipcMain.handle('mcp:set-enabled', async (_event, payload: unknown) => {
  const { name, enabled } = (payload ?? {}) as { name?: unknown; enabled?: unknown }
  if (typeof name !== 'string' || name.trim() === '') throw new Error('invalid server name')
  if (typeof enabled !== 'boolean') throw new Error('invalid enabled flag')
  const result = await hermesRest(
    restTarget(),
    `/api/mcp/servers/${encodeURIComponent(name)}/enabled`,
    { method: 'PUT', body: { enabled } }
  )
  // Their toggle writes config.yaml; the running gateway keeps its cached MCP
  // connections until told otherwise (the same caching that made task 1.20
  // necessary), so the change is not live until this reload.
  await reloadMcp()
  return result
})

ipcMain.handle('mcp:add', async (_event, payload: unknown) => {
  const body = (payload ?? {}) as Record<string, unknown>
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    throw new Error('invalid server name')
  }
  if (typeof body.url !== 'string' && typeof body.command !== 'string') {
    throw new Error('server needs a url or a command')
  }
  const created = await hermesRest(restTarget(), '/api/mcp/servers', { method: 'POST', body })
  await reloadMcp()
  return created
})

// DESTRUCTIVE: removes the server's configuration entirely (their DELETE has
// no undo, and the env map goes with it). `confirmed` is checked here, not
// only in the renderer — same rule as `rollback:restore`.
ipcMain.handle('mcp:remove', async (_event, payload: unknown) => {
  const { name, confirmed } = (payload ?? {}) as { name?: unknown; confirmed?: unknown }
  if (confirmed !== true) throw new Error('removing an MCP server requires explicit confirmation')
  if (typeof name !== 'string' || name.trim() === '') throw new Error('invalid server name')
  const result = await hermesRest(restTarget(), `/api/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
  await reloadMcp()
  return result
})

ipcMain.handle('mcp:test', async (_event, payload: unknown) => {
  const { name } = (payload ?? {}) as { name?: unknown }
  if (typeof name !== 'string' || name.trim() === '') throw new Error('invalid server name')
  // Their probe spawns the server and lists its tools; 60 s is their own
  // budget for it, and a shorter one here would report a timeout for a server
  // that was about to answer.
  return hermesRest(restTarget(), `/api/mcp/servers/${encodeURIComponent(name)}/test`, {
    method: 'POST',
    timeoutMs: 60000
  })
})

// "Перечитать серверы". The first call goes WITHOUT `confirm` on purpose: their
// handler answers `confirm_required` with the warning about invalidating the
// prompt cache, and the user should see that warning rather than have this app
// suppress it. The `always` option (which silences the warning forever in
// their config) is not offered.
ipcMain.handle('mcp:reload', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { confirm } = (payload ?? {}) as { confirm?: unknown }
  const activeSessionId = await ensureSession()
  return gateway.request(
    'reload.mcp',
    {
      session_id: activeSessionId,
      ...(confirm === true ? { confirm: true } : {})
    },
    RELOAD_MCP_TIMEOUT_MS
  )
})

// --- Settings screen: agent behaviour, toolsets, plugins, processes --------
// (batch 2 / 2a, task 1.6.B2.2). Contracts read off the installed gateway's
// `tui_gateway/server.py`; see shared/gateway/types.ts for the per-method
// notes and error codes.

// The `config.get`/`config.set` keys the SETTINGS screen may reach. Two
// allowlists exist on purpose (this one and PICKER_CONFIG_KEYS above): the
// composer must not be able to rewrite the system prompt, and this screen must
// not be able to switch the model behind the picker's back. `full` — which
// answers with the entire config.yaml, api key and all — is reachable from
// neither.
const AGENT_CONFIG_READ_KEYS = ['reasoning', 'fast', 'busy', 'prompt'] as const
type AgentConfigReadKey = (typeof AGENT_CONFIG_READ_KEYS)[number]
const AGENT_CONFIG_WRITE_KEYS = ['reasoning', 'fast', 'busy', 'prompt', 'verbose'] as const
type AgentConfigWriteKey = (typeof AGENT_CONFIG_WRITE_KEYS)[number]

function isAgentConfigReadKey(value: unknown): value is AgentConfigReadKey {
  return typeof value === 'string' && (AGENT_CONFIG_READ_KEYS as readonly string[]).includes(value)
}
function isAgentConfigWriteKey(value: unknown): value is AgentConfigWriteKey {
  return typeof value === 'string' && (AGENT_CONFIG_WRITE_KEYS as readonly string[]).includes(value)
}

ipcMain.handle('agent-config:get', async (_event, key: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  if (!isAgentConfigReadKey(key)) throw new Error('invalid config key')
  const activeSessionId = await ensureSession()
  return gateway.request('config.get', { key, session_id: activeSessionId })
})

ipcMain.handle('agent-config:set', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { key, value } = (payload ?? {}) as { key?: unknown; value?: unknown }
  if (!isAgentConfigWriteKey(key)) throw new Error('invalid config key')
  if (typeof value !== 'string') throw new Error('invalid config value')
  const activeSessionId = await ensureSession()
  return gateway.request('config.set', { key, value, session_id: activeSessionId })
})

// `config.show`, not `config.get {key:'full'}` — their handler masks the API
// key (`****last4`) and pre-renders the sections. Asking for the full config
// and formatting it here would put an unmasked key in the renderer for the
// sake of the same three sections.
ipcMain.handle('config:show', async () => {
  if (!gateway) throw new Error('no gateway connection')
  return gateway.request('config.show', {})
})

ipcMain.handle('tools:list', async () => {
  if (!gateway) throw new Error('no gateway connection')
  const activeSessionId = await ensureSession()
  return gateway.request('tools.list', { session_id: activeSessionId })
})

ipcMain.handle('tools:configure', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { action, names } = (payload ?? {}) as { action?: unknown; names?: unknown }
  if (action !== 'enable' && action !== 'disable') throw new Error('invalid tools action')
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string')) {
    throw new Error('invalid toolset names')
  }
  if (names.length === 0) throw new Error('no toolsets given')
  const activeSessionId = await ensureSession()
  return gateway.request('tools.configure', {
    action,
    names: names as string[],
    session_id: activeSessionId
  })
})

ipcMain.handle('plugins:list', async () => {
  if (!gateway) throw new Error('no gateway connection')
  const result = await gateway.request('plugins.manage', { action: 'list' })
  return {
    plugins: Array.isArray(result.plugins) ? result.plugins : [],
    userCount: typeof result.user_count === 'number' ? result.user_count : 0,
    bundledCount: typeof result.bundled_count === 'number' ? result.bundled_count : 0
  }
})

// Enabling a NON-bundled plugin runs third-party code inside the gateway
// process, so it takes an explicit confirmation — and the check is here, not
// in the renderer: `source` is re-read from the gateway's own list rather than
// trusted from the caller, so a renderer bug cannot mislabel a user plugin as
// bundled to skip the gate. Disabling never needs confirmation (it only ever
// removes capability).
ipcMain.handle('plugins:toggle', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { name, enable, confirmed } = (payload ?? {}) as {
    name?: unknown
    enable?: unknown
    confirmed?: unknown
  }
  if (typeof name !== 'string' || name.trim() === '') throw new Error('invalid plugin name')
  if (typeof enable !== 'boolean') throw new Error('invalid plugin state')

  if (enable) {
    const listing = await gateway.request('plugins.manage', { action: 'list' })
    const row = (listing.plugins ?? []).find((plugin) => plugin.name === name)
    if (row && row.source !== 'bundled' && confirmed !== true) {
      throw new Error('enabling a user plugin requires explicit confirmation')
    }
  }

  const result = await gateway.request('plugins.manage', { action: 'toggle', name, enable })
  return {
    ok: result.ok === true,
    unchanged: result.unchanged === true,
    plugin: result.plugin ?? null
  }
})

// Two sources, deliberately kept apart in the result: `process.list` is
// session-scoped and killable, `agents.list` is every session's processes and
// is observation only (their `process.kill` answers 4044 for a process owned
// by another session).
ipcMain.handle('processes:list', async () => {
  if (!gateway) throw new Error('no gateway connection')
  const activeSessionId = await ensureSession()
  const own = await gateway.request('process.list', { session_id: activeSessionId })
  let others: AgentProcessEntry[] = []
  try {
    const all = await gateway.request('agents.list', {})
    others = Array.isArray(all.processes) ? all.processes : []
  } catch (error: unknown) {
    // The cross-session view is extra context, not the point of the tab —
    // losing it must not empty the list of the user's own processes.
    console.error('aecpilot: agents.list failed', error)
  }
  const ownIds = new Set((own.processes ?? []).map((entry) => entry.session_id))
  return {
    own: Array.isArray(own.processes) ? own.processes : [],
    others: others.filter((entry) => !ownIds.has(entry.session_id))
  }
})

// Stops one process. `confirmed` is checked here for the same reason as
// `rollback:restore`: the confirmation step must not be skippable from the
// renderer. There is no "stop everything" channel — `process.stop` is
// `kill_all()` across every session of the gateway (decision R8).
ipcMain.handle('processes:kill', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('no gateway connection')
  const { processId, confirmed } = (payload ?? {}) as {
    processId?: unknown
    confirmed?: unknown
  }
  if (confirmed !== true) throw new Error('process.kill requires explicit confirmation')
  if (typeof processId !== 'string' || processId.trim() === '') {
    throw new Error('invalid process id')
  }
  const activeSessionId = await ensureSession()
  return gateway.request('process.kill', {
    session_id: activeSessionId,
    process_id: processId
  })
})

// Never rejects on a provider problem: "no usable credentials" IS the answer
// this screen exists to show.
ipcMain.handle('setup:runtime-check', async () => {
  if (!gateway) throw new Error('no gateway connection')
  try {
    return await gateway.request('setup.runtime_check', {})
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
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

/** Task 3.15 lifted this out of the `sessions:new` handler so the quick-entry
 * window's "new session" is the same act as pressing New Chat — one creation
 * path, one set of race guards. */
async function newSession(): Promise<{ sessionId: string }> {
  if (!gateway) throw new Error('gateway is not connected')
  const project = currentProject
  const epoch = sessionEpoch
  const result = await gateway.request('session.create', {
    source: 'aecpilot-desktop',
    ...(project ? { cwd: project.vaultPath } : {}),
    ...(sessionProfile ? { profile: sessionProfile } : {})
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
  return { sessionId: sessionId as string }
}

ipcMain.handle('sessions:new', async () => newSession())

ipcMain.handle('sessions:switch', async (_event, id: string) => {
  if (!gateway) throw new Error('gateway is not connected')
  if (typeof id !== 'string' || id.length === 0) throw new Error('invalid session id')
  const result = await gateway.request('session.resume', {
    session_id: id,
    ...(sessionProfile ? { profile: sessionProfile } : {})
  })
  sessionId = result.session_id
  sessionEpoch += 1
  ensureSessionPromise = undefined
  return { sessionId: result.session_id, messages: result.messages ?? [] }
})

// --- Sessions, details, palette, YOLO: batch 5 ------------------------------
// Contract: specs/agent-sessions.md. The one rule that runs through all of it:
// a LIVE sid and a STORED id are different things (see `LiveSessionId` /
// `StoredSessionId` in shared/gateway/types.ts). `session.list`/`resume`/
// `delete` take the stored one; everything else here takes the live one.

/** Live sessions of the gateway process, with `current` resolved against the
 * session THIS window is attached to (task 1.6.B5.9). A different question from
 * `sessions:list`, which reads the database — hence a separate channel rather
 * than a flag on that one. */
ipcMain.handle('sessions:list-active', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  return gateway.request('session.active_list', {
    ...(sessionId ? { current_session_id: sessionId } : {})
  })
})

// Attaching to another live session (task 1.6.B5.9). Their handler deliberately
// does NOT close the one we were on, so both stay in the live list — that is
// what makes these sessions parallel rather than a switch.
ipcMain.handle('sessions:activate', async (_event, liveId: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  if (typeof liveId !== 'string' || liveId === '') throw new Error('invalid session id')
  const result = await gateway.request('session.activate', { session_id: liveId })
  sessionId = result.session_id
  sessionEpoch += 1
  ensureSessionPromise = undefined
  return { sessionId: result.session_id, messages: result.messages ?? [] }
})

// DESTRUCTIVE and irreversible: their handler removes the DB row AND the
// on-disk transcript files. `confirmed` is checked here, not only in the
// renderer, for the same reason as `rollback:restore` — a stray call in the
// renderer must not be able to reach it.
ipcMain.handle('sessions:delete', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  const { storedId, confirmed } = (payload ?? {}) as { storedId?: unknown; confirmed?: unknown }
  if (confirmed !== true) throw new Error('session.delete requires explicit confirmation')
  if (typeof storedId !== 'string' || storedId === '') throw new Error('invalid session id')
  return gateway.request('session.delete', { session_id: storedId })
})

// The transcript of a STORED session (task 1.6.B7.3, the artifacts tab).
//
// Over REST, and rule R1 ("REST only where RPC does not reach") is satisfied
// twice over — both halves MEASURED in hermes 0.19.0:
//   1. `session.history` resolves a LIVE sid (`server.py::_sess_nowait`)
//      and answers 4001 for a stored id, so a finished session is unreadable
//      through it at all.
//   2. Even for a live one it strips the tool arguments:
//      `server.py::_history_to_messages` parses `tool_calls`, throws them away
//      and keeps an 80-character label — not enough to recover a path.
// `GET /api/sessions/{id}/messages` (`web_routers/sessions.py`) returns the raw rows
// of their `messages` table instead: `content`, parsed `tool_calls`, and a
// `timestamp` per message.
//
// `limit` is the core's own cap (500 max, its clamp); asking for the tail of a
// long session is not possible there — `offset` counts from the start — so the
// cap is left generous and the scan simply reads what it gets.
ipcMain.handle('sessions:messages', async (_event, storedId: unknown) => {
  if (typeof storedId !== 'string' || storedId === '') throw new Error('invalid session id')
  const result = await hermesRest<{ messages?: unknown[] }>(
    restTarget(),
    `/api/sessions/${encodeURIComponent(storedId)}/messages`,
    { query: { limit: '500' } }
  )
  return { messages: Array.isArray(result.messages) ? result.messages : [] }
})

/** The live sid of `storedId` if the gateway is holding that session open, else
 * `undefined`. `session.active_list` is the only place the two ids appear
 * side by side (`id` + `session_key`). */
async function liveSidForStored(storedId: string): Promise<string | undefined> {
  if (!gateway) return undefined
  const { sessions } = await gateway.request('session.active_list', {
    ...(sessionId ? { current_session_id: sessionId } : {})
  })
  return sessions.find((row) => row.session_key === storedId)?.id
}

// Renaming (task 1.6.B5.7). `session.title` resolves a LIVE sid, so a session
// that is only a database row has to be resumed first — that is a property of
// their handler, not a choice here.
//
// Resuming for a rename does NOT switch this window to that session: `sessionId`
// is left alone, and the resumed session simply becomes one more live session in
// the gateway. Renaming something in a list should not move the user out of the
// conversation they are in.
ipcMain.handle('sessions:rename', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  const { storedId, title } = (payload ?? {}) as { storedId?: unknown; title?: unknown }
  if (typeof storedId !== 'string' || storedId === '') throw new Error('invalid session id')
  if (typeof title !== 'string' || title.trim() === '') throw new Error('invalid session title')

  let liveId = await liveSidForStored(storedId)
  if (!liveId) {
    const resumed = await gateway.request('session.resume', {
      session_id: storedId,
      ...(sessionProfile ? { profile: sessionProfile } : {})
    })
    liveId = resumed.session_id
  }
  const result = await gateway.request('session.title', { session_id: liveId, title: title.trim() })
  return { title: result.title ?? title.trim(), pending: result.pending === true }
})

// Branching (task 1.6.B5.10). Two things their answer does not give us and this
// handler recovers: the branch's STORED key (needed to tag it against the
// project — read back from `session.active_list`) and its history (unchanged
// from the parent's, which the renderer already shows).
ipcMain.handle('sessions:branch', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  const { name } = (payload ?? {}) as { name?: unknown }
  const activeSessionId = await ensureSession()
  const project = currentProject
  const result = await gateway.request('session.branch', {
    session_id: activeSessionId,
    ...(typeof name === 'string' && name.trim() !== '' ? { name: name.trim() } : {})
  })
  sessionId = result.session_id
  sessionEpoch += 1
  ensureSessionPromise = undefined
  if (project) {
    // Best-effort: an untagged branch would simply not show up in this
    // project's list until it is renamed/reopened — worth trying, never worth
    // failing the branch over.
    try {
      const { sessions } = await gateway.request('session.active_list', {
        current_session_id: result.session_id
      })
      const stored = sessions.find((row) => row.id === result.session_id)?.session_key
      if (stored) tagSessionProject(stored, project.vaultPath)
    } catch (error: unknown) {
      console.error('aecpilot: could not tag the new branch against the project', error)
    }
  }
  return { sessionId: result.session_id, title: result.title }
})

ipcMain.handle('session:usage', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  return gateway.request('session.usage', { session_id: await ensureSession() })
})

ipcMain.handle('session:context-breakdown', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  return gateway.request('session.context_breakdown', { session_id: await ensureSession() })
})

// Manual compression (task 1.6.B5.13). The transcript is redrawn from
// `session.history`, NOT from `session.compress`'s own `messages`: that field
// carries the agent's raw history (`content`, `tool_calls`), not the
// `{role, text}` shape every other path in this app speaks, so rendering it
// would produce empty bubbles. See `SessionCompressResult`.
ipcMain.handle('session:compress', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  const { focusTopic } = (payload ?? {}) as { focusTopic?: unknown }
  const activeSessionId = await ensureSession()
  const result = await gateway.request('session.compress', {
    session_id: activeSessionId,
    ...(typeof focusTopic === 'string' && focusTopic.trim() !== ''
      ? { focus_topic: focusTopic.trim() }
      : {})
  })
  const history = await gateway.request('session.history', { session_id: activeSessionId })
  return {
    status: result.status ?? '',
    beforeMessages: result.before_messages ?? 0,
    afterMessages: result.after_messages ?? 0,
    beforeTokens: result.before_tokens ?? 0,
    afterTokens: result.after_tokens ?? 0,
    messages: history.messages ?? []
  }
})

ipcMain.handle('session:undo', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  return gateway.request('session.undo', { session_id: await ensureSession() })
})

ipcMain.handle('session:steer', async (_event, text: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  if (typeof text !== 'string' || text.trim() === '') throw new Error('invalid steer text')
  return gateway.request('session.steer', {
    session_id: await ensureSession(),
    text: text.trim()
  })
})

ipcMain.handle('commands:catalog', async () => {
  if (!gateway) throw new Error('gateway is not connected')
  return gateway.request('commands.catalog', {})
})

ipcMain.handle('commands:dispatch', async (_event, payload: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  const { name, arg } = (payload ?? {}) as { name?: unknown; arg?: unknown }
  if (typeof name !== 'string' || name.trim() === '') throw new Error('invalid command name')
  return gateway.request('command.dispatch', {
    name: name.trim(),
    arg: typeof arg === 'string' ? arg : '',
    session_id: await ensureSession()
  })
})

// The YOLO zap (tasks 1.6.B5.21/B5.22). Two guarantees live here rather than in
// the renderer, because both protect something outside this window:
//   - no `scope` is ever sent, so their global branch (which rewrites
//     `approvals.mode` in config.yaml and would destroy this app's `smart`
//     mode) is unreachable from the UI. The type has no 'global' member either.
//   - a session is REQUIRED and is never created for this: with no live
//     session their handler falls through to `HERMES_YOLO_MODE` in the
//     gateway's own environment, i.e. it would flip approvals for every
//     session of the process.
// `value` is an explicit '1'/'0' — any other value, empty string included,
// makes their handler invert the current state instead.
// --- Profiles (task 1.6.B5.23) ---------------------------------------------
// The batch's one REST surface, and the reason is not preference: there are no
// `profile.*` methods in the gateway at all (owner decision B5-1=C, rule R1).
// Every route below was measured by `runtime/profiles-probe.mjs` against a live
// process before this was written.
//
// What this app deliberately does NOT call: `POST /api/profiles/active`. It
// writes a sticky preference that changes which profile the user's own CLI
// picks up next time, and their handler's comment says it does not retarget a
// running process anyway. Switching a chat is done the way that actually works
// — the `profile` parameter on `session.create`/`session.resume`, measured
// accepted by the probe.

ipcMain.handle('profiles:list', async () => {
  const target = restTarget()
  const [listed, active] = await Promise.all([
    hermesRest<unknown>(target, '/api/profiles'),
    hermesRest<unknown>(target, '/api/profiles/active')
  ])
  const { current, active: sticky } = parseActiveProfile(active)
  return {
    profiles: parseProfileList(listed),
    // What sessions are actually built against right now: the profile the user
    // picked in this app, or the one the gateway was launched with.
    current: sessionProfile ?? current,
    launched: current,
    active: sticky
  }
})

ipcMain.handle('profiles:create', async (_event, payload: unknown) => {
  const { name } = (payload ?? {}) as { name?: unknown }
  if (!isValidProfileName(name)) throw new Error('недопустимое имя профиля')
  return hermesRest(restTarget(), '/api/profiles', { method: 'POST', body: { name } })
})

// DESTRUCTIVE — removes the profile's whole directory: its config, keys, skills
// and session history. Three checks live here rather than in the renderer:
// the confirmation, the name (it goes into a URL path segment), and the two
// profiles that must never be deleted.
ipcMain.handle('profiles:delete', async (_event, payload: unknown) => {
  const { name, confirmed } = (payload ?? {}) as { name?: unknown; confirmed?: unknown }
  if (confirmed !== true) throw new Error('удаление профиля требует подтверждения')
  if (!isValidProfileName(name)) throw new Error('недопустимое имя профиля')
  const target = restTarget()
  const { current } = parseActiveProfile(await hermesRest<unknown>(target, '/api/profiles/active'))
  const refusal = refuseProfileDeletion(name, sessionProfile ?? current)
  if (refusal) throw new Error(refusal)
  return hermesRest(target, `/api/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' })
})

// Points new and resumed sessions at another profile. The active session is
// abandoned the same way a project switch abandons it (task 1.20): the next
// send builds a session under the new profile, and the renderer clears the
// transcript to match.
ipcMain.handle('profiles:use', async (_event, payload: unknown) => {
  const { name } = (payload ?? {}) as { name?: unknown }
  if (!isValidProfileName(name)) throw new Error('недопустимое имя профиля')
  const target = restTarget()
  const { current } = parseActiveProfile(await hermesRest<unknown>(target, '/api/profiles/active'))
  sessionProfile = name === current ? undefined : name
  resetActiveSessionForProjectSwitch()
  return { ok: true, current: sessionProfile ?? current }
})

// Задачи 3C.1 и 3D.6 (SPEC UR27). От нашей проводки роестра осталось одно:
// список профилей для снимка, который читает инструмент `aec-roster`. Экраны
// ведёт их плагин (3D.3), обращения к ядру идут его путём.
//
// Зависимость вносится здесь, потому что здесь живёт шлюз: модуль роестра не
// должен знать, к какому ядру мы сейчас подключены.
configureRoster({
  request: async (method, params) => {
    if (!gateway) throw new Error('нет связи с ядром')
    // Метод приходит строкой из модуля роестра, а карта методов типизирована по
    // именам. Сужение здесь, в одном месте: проверять имя метода в каждом
    // вызове значило бы повторять карту вторым списком.
    return gateway.request(method as Parameters<typeof gateway.request>[0], params as never)
  }
})

// Задача 3D.4. Снимок роестра больше НЕ может держаться на `roster:list`:
// после 3D.3 роестр ведёт их плагин, а он этот обработчик не зовёт. Оставить
// как было значило бы получить худший вид отказа — `@имя` замолчало бы МОЛЧА,
// прочитав файл, который никто не обновляет.
//
// ПОЧЕМУ ОПРОС, А НЕ СОБЫТИЕ. Ядро о создании профиля не сообщает: в
// `tui_gateway/**` нет ни одного события про профили (замерено 2026-09-05).
// Их плагин узнаёт о новом боте своим опросом в рендерере, но рендерер — не
// источник для главного процесса: снимок нужен и когда окно закрыто, а агент
// работает.
//
// ЧТО СТОИТ ОПРОС. Один `profiles.list` в минуту по уже открытому сокету, и
// запись на диск только при изменении (`writeRosterSnapshot` возвращает false,
// когда содержимое совпало) — то есть перезапуск MCP-сервера случается ровно
// тогда, когда роестр действительно поменялся.
const ROSTER_SNAPSHOT_POLL_MS = 60_000
let rosterSnapshotTimer: NodeJS.Timeout | undefined

async function refreshRosterSnapshot(): Promise<void> {
  if (!gateway) return
  try {
    await syncRosterTool(await listRoster())
  } catch (error: unknown) {
    // Ядро могло ещё не подняться или отвалиться — это не повод шуметь на
    // каждый тик. Причина уходит в журнал (задача 3.29), а следующий тик
    // попробует снова.
    console.error('aecpilot: roster snapshot refresh failed', error)
  }
}

export function startRosterSnapshotPolling(): void {
  if (rosterSnapshotTimer) return
  rosterSnapshotTimer = setInterval(() => void refreshRosterSnapshot(), ROSTER_SNAPSHOT_POLL_MS)
  // Первый снимок — сразу, а не через минуту: приложение только что открыли,
  // и обращение по имени должно работать с первой реплики.
  void refreshRosterSnapshot()
}

export function stopRosterSnapshotPolling(): void {
  if (!rosterSnapshotTimer) return
  clearInterval(rosterSnapshotTimer)
  rosterSnapshotTimer = undefined
}

ipcMain.handle('yolo:set', async (_event, enabled: unknown) => {
  if (!gateway) throw new Error('gateway is not connected')
  if (typeof enabled !== 'boolean') throw new Error('invalid yolo flag')
  if (!sessionId) throw new Error('нет живой сессии — YOLO переключается только в её пределах')
  return gateway.request('config.set', {
    key: 'yolo',
    value: enabled ? '1' : '0',
    session_id: sessionId
  })
})

// ── Задача 3E.11. Служебная механика окна (UR35) ───────────────────────────
//
// Три канала, у которых нет своего экрана: окно сообщает, что агент работает;
// человек запрещает F12; экран «о программе» спрашивает версию. Четвёртый из
// этой группы — фоновые подсказки (`ambient:claim`) — подключён раньше.

ipcMain.on('active-work:set', (event, payload: unknown) => {
  activeWorkByWindow.set(event.sender.id, normalizeActiveWork(payload))
})

ipcMain.on('devtools:disable-f12', (_event, blocked: unknown) => {
  setDevtoolsBlocked(blocked === true)
})

// ── Задача 3E.10. Правый клик и проверка орфографии (UR37) ─────────────────
//
// Меню рисует ОКНО — так у них, и поэтому подписи в нём переведены вместе со
// всем остальным. Здесь остаётся то, чего окно не может: глаголы правки
// действуют на сфокусированный элемент отправителя, байты картинки достаёт
// только `copyImageAt`, а словарь принадлежит сессии.

ipcMain.handle('context-menu:edit', (event, command: unknown) => {
  const verb = readEditCommand(command)
  if (verb === 'copy') event.sender.copy()
  else if (verb === 'cut') event.sender.cut()
  else if (verb === 'paste') event.sender.paste()
  else if (verb === 'selectAll') event.sender.selectAll()
})

ipcMain.handle('context-menu:copy-image', (event) => copyImageAtLastGesture(event.sender))

ipcMain.handle('context-menu-spellcheck:apply', (event, action: unknown) => {
  const parsed = readSpellcheckAction(action)
  if (parsed) applySpellcheckAction(event.sender, parsed)
})

ipcMain.handle('context-menu-spellcheck:guest-add-word', (_event, payload: unknown) => {
  const raw = (payload ?? {}) as { webContentsId?: unknown; word?: unknown }
  const word = typeof raw.word === 'string' ? raw.word.trim() : ''
  if (word !== '' && typeof raw.webContentsId === 'number') {
    addWordToGuestDictionary(raw.webContentsId, word)
  }
})

/** Версия — НАША, а не донорская (C12). Их поля про рассинхронизацию сборки
 * (`bundleOutOfSync`, `bundleCommitsBehind`) не заполняются: они про их
 * механизм обновления из исходников, которого у нас нет. Необязательные поля
 * их контракта, поэтому пропуск честнее выдуманного числа. */
ipcMain.handle('version:get', async () => {
  let hermesRoot = ''
  try {
    hermesRoot = (await loadServeModule()).HERMES_HOME_DIR
  } catch {
    // Удалённое ядро: его корень не на этой машине, и показывать нечего.
  }

  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    hermesRoot
  }
})

ipcMain.handle('gateway:get-state', () => gatewayState)

// The two generic doors the donor's gateway client rides on (task 1.8.5).
// Their ~200 typed wrappers all funnel into one `request(method, params)` and
// one REST call, so these two handlers replace what would otherwise have been
// 200 edits to their files. Rules — including the two surfaces rule R2 forbids
// — live in `gateway-passthrough-pure.ts`; the token and the socket stay here.
ipcMain.handle(
  'gateway:rpc',
  async (
    _event,
    payload: { method?: unknown; params?: unknown; timeoutMs?: unknown }
  ): Promise<GatewayRpcOutcome<unknown>> => {
    // Отказ возвращается ЗНАЧЕНИЕМ, а не исключением: `ipcRenderer.invoke`
    // доносит только текст, и код с данными JSON-RPC терялись по дороге
    // (находка D-37). Собирает их обратно `gateway-bridge.ts`.
    try {
      if (!gateway) throw new Error('gateway is not connected')
      const method = checkRpcCall(payload?.method)
      // A hidden turn is not a thing this product has (task 3.4в, risk R19).
      // Задача 5.14: язык ответов агента дописывается в SOUL создаваемого
      // специалиста здесь — их диалог собирает SOUL сам и про язык не знает, а
      // правка вендорного файла не входит в пять разрешённых (AGENTS §14).
      const params = applySoulLanguage(
        method,
        sanitizeRpcParams(payload?.params),
        soulLanguageLine(loadAgentLanguage())
      ) as never
      const timeoutMs = typeof payload?.timeoutMs === 'number' ? payload.timeoutMs : undefined
      const value = await gateway.request(method as never, params, timeoutMs)
      followWindowSession(method, value)
      return { ok: true, value }
    } catch (error: unknown) {
      return { ok: false, error: describeRpcFailure(error) }
    }
  }
)

// Ответ окна на вопрос ядра (0.21.3, задача 3.B5в) — кадр с id вопроса. Задача
// 3E.4 (R22): текст страницы предпросмотра, который окно шлёт ядру, помечается
// недоверенным ЗДЕСЬ, по имени запроса — дальше по пути правку делать негде
// (ядро не патчится, обработчик в окне — зона донора). Секрет (`secret`) едет
// в `answer.result.value` и здесь не читается, не пишется в журнал и не
// попадает в текст ошибки.
ipcMain.handle(
  'gateway:server-respond',
  (_event, payload: { id?: unknown; answer?: unknown }): boolean => {
    if (!gateway) return false
    const id = payload?.id
    const answer = payload?.answer as GatewayServerResponse | undefined
    if (typeof id !== 'string' || id === '' || !answer || typeof answer !== 'object') return false
    const method = serverRequestMethods.get(id)
    let outcome: boolean
    if ('result' in answer) {
      const result = isPlainRecord(answer.result) ? answer.result : {}
      outcome = gateway.respondToServerRequest(id, {
        result: method ? markUntrustedPageText(method, result) : result
      })
    } else if ('error' in answer && isPlainRecord(answer.error)) {
      const code = typeof answer.error.code === 'number' ? answer.error.code : -32000
      const message = typeof answer.error.message === 'string' ? answer.error.message : 'error'
      outcome = gateway.respondToServerRequest(id, { error: { code, message } })
    } else {
      return false
    }
    if (outcome) serverRequestMethods.delete(id)
    return outcome
  }
)

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Записать учётные данные, пришедшие из ИХ панели настроек, по нашему правилу
 * (задача 3E.2, C10/R2). Возвращает то же `{ ok: true }`, что вернуло бы ядро,
 * — их панель не знает, что запись поехала другим путём, и знать не должна.
 *
 * Отказы здесь ГРОМКИЕ: их панель показывает брошенную ошибку человеку. Тихо
 * ответить «сохранено», не сохранив, было бы худшим из вариантов — человек
 * ушёл бы с экрана, считая ключ введённым.
 */
async function captureCredentialWrite(write: {
  action: 'store' | 'clear'
  envVar: string
  value: string
}): Promise<{ ok: boolean }> {
  let profileDir: string | undefined
  try {
    profileDir = (await loadServeModule()).HERMES_HOME_DIR
  } catch {
    // Удалённое ядро: `.env` его профиля не на этой машине, проверять нечего.
  }

  // Строка в `.env` профиля СИЛЬНЕЕ окружения (`get_env_value_prefer_dotenv` в
  // ядре), поэтому сохранить поверх неё значит сохранить в никуда.
  if (write.action === 'store' && profileDir && keyEnvVarStatus(profileDir, write.envVar)) {
    throw new Error(
      `${write.envVar} задан в .env профиля — значение оттуда сильнее нашего. ` +
        'Уберите строку из .env и повторите.'
    )
  }

  if (!setProviderKey(write.envVar, write.action === 'store' ? write.value : null)) {
    throw new Error(
      'safeStorage недоступен на этой машине — ключ не сохранён (в открытом виде не пишем)'
    )
  }

  // Удаление идёт и у ядра: значение могло лечь в `.env` до этого правила.
  if (write.action === 'clear') {
    try {
      await hermesRest(restTarget(), '/api/env', {
        method: 'DELETE',
        body: { key: write.envVar }
      })
    } catch (error: unknown) {
      console.error('aecpilot: could not clear the credential in the core .env', error)
    }
  }

  // Ключ доходит до ядра только окружением дочернего процесса — значит
  // вступает в силу со следующего старта и не раньше.
  await restartBackend()
  return { ok: true }
}

ipcMain.handle(
  'gateway:rest',
  async (
    _event,
    payload: { path?: unknown; method?: unknown; body?: unknown; timeoutMs?: unknown }
  ) => {
    const { method, path } = checkRestCall(payload?.method, payload?.path)

    // Задача 3E.2. Ключ, введённый в ИХ панели настроек инструментов, обязан
    // лечь в наше шифрованное хранилище, а не в `.env` профиля открытым
    // текстом (C10, R2). Правило разбирает значение по смыслу, а не по тому,
    // кто позвал: их файл при этом не правится вовсе.
    const envWrite = classifyEnvWrite(method, path, payload?.body)
    if (envWrite.action !== 'forward') return captureCredentialWrite(envWrite)

    try {
      return await hermesRest(restTarget(), path, {
        method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        ...(payload?.body === undefined ? {} : { body: payload.body }),
        ...(typeof payload?.timeoutMs === 'number' ? { timeoutMs: payload.timeoutMs } : {})
      })
    } catch (error: unknown) {
      // One known core regression gets a message the user can act on instead
      // of a raw 500 (D-14); everything else is passed through untouched.
      const message = error instanceof Error ? error.message : String(error)
      const explained = explainProfileDeleteFailure(method, path, message)
      throw explained ? new Error(explained) : error
    }
  }
)

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

  return restartBackend(next)
})

/**
 * Переподключается к тому ядру, которое выбрано сейчас (задача 3.12).
 *
 * ДВА РАЗНЫХ МИРА. В удалённом режиме своего процесса быть НЕ ДОЛЖНО: он не
 * просто лишний — он второй агент на тех же файлах, со своими расписаниями и
 * своим индексом. Поэтому переход в удалённый режим его останавливает, а не
 * оставляет «на всякий случай».
 *
 * Обратный переход поднимает его заново — той же последовательностью, что и
 * старт приложения, иначе получилось бы два способа завести один процесс.
 */
/** Настройка ssh в том виде, в каком её понимает транспорт. Один перевод на
 * всё приложение: поля у нас и у них называются по-разному, и делать этот
 * перевод в каждом месте — верный способ развести их со временем. */
function sshTargetOf(settings: SshSettings): SshTarget | null {
  return readSshTarget({
    sshHost: settings.host,
    sshUser: settings.user,
    sshPort: settings.port,
    sshKeyPath: settings.keyPath,
    sshRemoteHermesPath: settings.remoteHermesPath,
    sshRemoteProfile: settings.remoteProfile
  })
}

/** Поднимает ядро на той машине и подключается к нему через туннель.
 *
 * Возвращает ответ, а не бросает: отказ сервера — это то, что человеку надо
 * показать словами, а не запись в журнале при пустом окне. */
async function connectViaSsh(): Promise<ReconnectOutcome> {
  const target = sshTargetOf(sshSettings())
  if (!target) return { ok: false, error: 'Не указана машина, к которой подключаться' }

  const result = await startSshTunnel(target)
  if (!result.ok) {
    console.warn('aecpilot: ssh tunnel FAIL', result.sshError)
    return { ok: false, error: result.error, sshError: result.sshError }
  }

  const remote = remoteTarget()
  if (!remote) return { ok: false, error: 'Туннель поднялся, но подключение не состоялось' }

  // SECURITY: адрес сокета несёт токен — он собирается здесь и здесь остаётся.
  await connectGateway(wsUrlFor(remote.baseUrl, remote.token))
  return { ok: true }
}

/** Чем закончилась попытка подключиться. `sshError` — их код ошибки: их экран
 * по нему показывает СВОЙ текст с нужным действием, и терять его значило бы
 * заменять шесть разных советов одним «не получилось». */
interface ReconnectOutcome {
  ok: boolean
  error?: string
  sshError?: string
}

async function reconnectForConnection(): Promise<ReconnectOutcome> {
  gateway?.close()
  gateway = undefined
  sessionId = undefined
  sessionEpoch += 1
  ensureSessionPromise = undefined

  // Свой процесс не нужен ни в одном удалённом режиме — останавливаем до того,
  // как подключаться: два агента на тех же файлах это два индекса и два
  // расписания.
  const stopLocal = async (): Promise<void> => {
    if (serveHandle && stopServeFn) {
      const handle = serveHandle
      serveHandle = undefined
      await stopServeFn(handle)
    }
  }

  if (connectionMode() === 'ssh') {
    await stopLocal()
    return connectViaSsh()
  }

  // Возврат из ssh: туннель, оставшийся жить, держал бы ядро на той машине.
  await stopSshTunnel()

  const remote = remoteTarget()

  if (remote) {
    await stopLocal()
    // SECURITY: адрес сокета несёт токен. Он собирается здесь и здесь же
    // остаётся — ни в журнал, ни через IPC он не уходит (см. `app-log`).
    await connectGateway(wsUrlFor(remote.baseUrl, remote.token))
    return { ok: true }
  }

  const restarted = await restartBackend()
  return { ok: restarted.ok, error: restarted.error }
}

/** Гасит наш процесс ядра и НЕ поднимает его обратно (задача 5.16).
 *
 * Зачем отдельно от `restartBackend`: список фактов памяти читается только при
 * остановленном ядре — встроенный qdrant держит папку исключительно, — и между
 * остановкой и подъёмом стоит человек, а не одна последовательность. Подъём
 * обратно делает та же `restartBackend`, что и везде. */
async function stopBackend(): Promise<void> {
  if (serveHandle && stopServeFn) {
    const handle = serveHandle
    serveHandle = undefined
    await stopServeFn(handle)
  }
}

/** Stops the hermes backend, applies `configOverride` to the profile's
 * config.yaml if given, and starts it again with the current credential env.
 *
 * Extracted from `settings:save` (task 1.6.B2.5) because saving a provider key
 * in the new "Доступы" section needs exactly the same sequence: keys are
 * injected into the child process's environment at spawn time, so a key that
 * arrives later only takes effect on the next start. One implementation means
 * the two paths cannot drift into leaving the app connected to a backend
 * running with stale credentials. */
async function restartBackend(configOverride?: {
  model?: string
  baseUrl?: string
}): Promise<{ ok: boolean; restarted: boolean; error?: string }> {
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

    if (configOverride) applyModelConfigOverride(HERMES_HOME_DIR, configOverride)
    serveHandle = await startServe({ extraEnv: buildExtraEnv() })
    stopServeFn = stopServe
    // Без числа — окно берётся из `serve.mjs` (`HEALTH_TIMEOUT_MS`), где рядом
    // лежит замер холодного старта. Здесь стояло 30000, и это ровно тот случай,
    // ради которого находка D-36 заведена: человек меняет модель, шлюз
    // перезапускается, и на холодной машине «не поднялся» читается как поломка.
    await waitHealthy(serveHandle)

    // Close the old gateway client before wiring a new one — avoids two
    // live clients racing to forward events/state to the same windows.
    gateway?.close()
    sessionId = undefined
    sessionEpoch += 1
    ensureSessionPromise = undefined
    await connectGateway(serveHandle.wsUrl)

    return { ok: true, restarted: true }
  } catch (error: unknown) {
    console.error('aecpilot: backend restart FAIL', error)
    return {
      ok: false,
      restarted: false,
      error: error instanceof Error ? error.message : 'backend restart failed'
    }
  }
}

// --- Provider keys, "Доступы" (task 1.6.B2.5) ------------------------------
// Owner decision R2: our own encrypted store, never their plaintext `.env`.
// The renderer learns exactly three things per credential env var — whether a
// key is stored, whether the profile's dev `.env` would override it, and
// whether this machine can encrypt at all. No value, and no mask of a value,
// crosses this boundary in either direction except the key being SET.

ipcMain.handle('keys:list', async (_event, envVars: unknown) => {
  const names = Array.isArray(envVars) ? envVars.filter(isCredentialEnvVarName) : []
  const stored = new Set(storedProviderKeyNames())
  let profileDir: string | undefined
  try {
    profileDir = (await loadServeModule()).HERMES_HOME_DIR
  } catch (error: unknown) {
    console.error('aecpilot: could not locate the hermes profile for .env checks', error)
  }
  // Names with a stored key are always listed, even if the catalogue no longer
  // mentions them: a key the user can no longer see is a key they cannot
  // delete.
  const allNames = [...new Set([...names, ...stored])].sort()
  return {
    encryptionAvailable: isEncryptionAvailable(),
    keys: allNames.map((envVar) => ({
      envVar,
      hasKey: stored.has(envVar),
      envOverrides: profileDir ? keyEnvVarStatus(profileDir, envVar) : false
    }))
  }
})

ipcMain.handle('keys:save', async (_event, payload: unknown) => {
  const { envVar, key } = (payload ?? {}) as { envVar?: unknown; key?: unknown }
  if (!isCredentialEnvVarName(envVar)) throw new Error('invalid credential env var name')
  if (key !== null && typeof key !== 'string') throw new Error('invalid key')
  const value = key === null ? null : key.trim()
  if (value !== null && value === '') throw new Error('empty key')

  if (!setProviderKey(envVar, value)) {
    return {
      ok: false,
      restarted: false,
      error: 'safeStorage недоступен на этой машине — ключ не сохранён (в открытом виде не пишем)'
    }
  }
  // A key only reaches hermes through the child process's environment, so it
  // takes effect on the next start and not before.
  return restartBackend()
})

// --- Доступы Microsoft Graph (задача 3E.9а, SPECIFICATION UR34) ------------
//
// ТОЛЬКО ЧТЕНИЕ. Записывать учётные данные здесь нечем и не нужно: для этого
// уже есть `keys:save` — наше шифрованное хранилище, из которого значения
// попадают в окружение дочернего процесса ядра и никогда в `.env` профиля
// (решение владельца R2). Второй путь записи был бы вторым местом, где можно
// ошибиться секретом.
//
// ЗАЧЕМ ТОГДА ЭТОТ ОБРАБОТЧИК. Доступ к Graph складывается из четырёх мест
// (см. `graph-access-pure.ts`), и три из них живут в профиле, а не у нас.
// Человеку нужен один ответ на вопрос «чего не хватает», иначе он вводит секрет
// и получает тишину.
ipcMain.handle('graph:access', async (): Promise<GraphAccessState> => {
  const stored = new Set(storedProviderKeyNames())
  let profileDir: string | undefined
  try {
    profileDir = (await loadServeModule()).HERMES_HOME_DIR
  } catch (error: unknown) {
    console.error('aecpilot: could not locate the hermes profile for Graph access', error)
  }

  let configText: string | undefined
  if (profileDir) {
    try {
      configText = readFileSync(join(profileDir, 'config.yaml'), 'utf-8')
    } catch (error: unknown) {
      console.error('aecpilot: could not read config.yaml for Graph access', error)
    }
  }

  return {
    encryptionAvailable: isEncryptionAvailable(),
    keys: GRAPH_ENV_VARS.map((envVar) => ({
      envVar,
      hasKey: stored.has(envVar),
      envOverrides: profileDir ? keyEnvVarStatus(profileDir, envVar) : false
    })),
    // Профиль не прочитан — говорим это значением, а не показываем четыре
    // «выключено»: ядро на другой машине, и выключателей тут нет вовсе.
    profileRead: configText !== undefined,
    readiness: readGraphReadiness(configText ?? '')
  }
})

// --- Экран памяти, слой 1 и автозапись (задача 5.4) ------------------------
//
// ПОЧЕМУ ФАЙЛАМИ, А НЕ ЧЕРЕЗ ЯДРО. Записку слоя 1 ядро хранит двумя обычными
// файлами в профиле и перечитывает при каждой сборке системного промпта
// (`agent/system_prompt.py`: `load_from_disk()`), то есть правка доезжает со
// следующего хода без перезапуска. Ни RPC, ни эндпойнта, который отдавал бы её
// ТЕКСТ, у них нет: `/api/memory` сообщает только провайдера и РАЗМЕРЫ файлов.
//
// ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ: списка фактов слоя 2. Его хранилище — встроенный
// qdrant, и он держит свою папку исключительно. Замерено
// `runtime/memory-store-access-probe.mjs`: при живом ядре второй читатель
// получает «Storage folder … is already accessed by another instance of Qdrant
// client». Обходов нет — HTTP-маршруты плагинов монтирует их ПАНЕЛЬ, которую
// шлюз не поднимает, а RPC «позови инструмент по имени» у шлюза отсутствует.
// Решение (qdrant сервером против новой поверхности) — владельца, см. TASKS 5.4.
ipcMain.handle('memory:read-notes', async () => {
  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    const dir = join(HERMES_HOME_DIR, 'memories')
    const read = (file: string): string => {
      try {
        return readFileSync(join(dir, file), 'utf-8')
      } catch {
        return '' // записки ещё нет — это обычное состояние чистого профиля
      }
    }

    return {
      ok: true as const,
      memory: read(NOTE_FILES.memory),
      user: read(NOTE_FILES.user),
      limits: NOTE_LIMITS,
      autowrite: parseAutowrite(
        (() => {
          try {
            return readFileSync(join(HERMES_HOME_DIR, AUTOWRITE_FILE), 'utf-8')
          } catch {
            return null
          }
        })()
      ).autowrite
    }
  } catch (error: unknown) {
    console.error('aecpilot: could not read the memory notes', error)
    return { ok: false as const, error: 'Не удалось прочитать записку памяти' }
  }
})

ipcMain.handle('memory:write-note', async (_event, payload: unknown) => {
  const value = payload as { target?: unknown; content?: unknown } | null
  const decision = decideNoteWrite(value?.target, value?.content)
  if (!decision.ok) return { ok: false as const, error: decision.error }

  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    const dir = join(HERMES_HOME_DIR, 'memories')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, decision.file), decision.content, 'utf-8')
    return { ok: true as const }
  } catch (error: unknown) {
    console.error('aecpilot: could not write the memory note', error)
    return { ok: false as const, error: 'Не удалось сохранить записку' }
  }
})

// ПЕРЕКЛЮЧАТЕЛЬ ТРОГАЕТ ДВА МЕСТА, потому что автозапись у памяти двойная:
// слой 2 пополняется концом хода (выключателя у ядра нет — его исполняет наш
// плагин, читая `aec-memory.json`), слой 1 — их фоновым разбором, у которого
// выключатель есть обычным ключом конфига. Человек просил «не записывай сам», а
// не «не записывай сам в одно из двух мест».
ipcMain.handle('memory:set-autowrite', async (_event, enabled: unknown) => {
  if (typeof enabled !== 'boolean') throw new Error('invalid autowrite flag')

  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    writeFileSync(
      join(HERMES_HOME_DIR, AUTOWRITE_FILE),
      serializeAutowrite({ autowrite: enabled }),
      'utf-8'
    )

    const configPath = join(HERMES_HOME_DIR, 'config.yaml')
    let original = ''
    try {
      original = readFileSync(configPath, 'utf-8')
    } catch {
      // конфига ещё нет — секция допишется в новый файл
    }
    writeFileSync(configPath, mergeBackgroundReview(original, enabled), 'utf-8')

    return { ok: true as const, autowrite: enabled }
  } catch (error: unknown) {
    console.error('aecpilot: could not change the memory autowrite flag', error)
    return { ok: false as const, error: 'Не удалось изменить автозапись' }
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
// Task 4D-15: the two bridge members the donor's composer drop engine calls.
// Why they are scoped the way they are — attachments.ts's header.
const ATTACHMENTS_DIR = join(app.getPath('userData'), 'attachments')

ipcMain.handle('attachments:save-image', async (_event, payload: unknown) => {
  const { bytes, extension } = (payload ?? {}) as { bytes?: unknown; extension?: unknown }
  if (!(bytes instanceof Uint8Array)) return { ok: false, error: 'bytes must be a Uint8Array' }
  try {
    return { ok: true, path: await saveAttachment(ATTACHMENTS_DIR, bytes, extension) }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('attachments:read-data-url', async (_event, payload: unknown) => {
  const { path: filePath } = (payload ?? {}) as { path?: unknown }
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return { ok: false, error: 'path must be a non-empty string' }
  }
  try {
    return {
      ok: true,
      dataUrl: await readAttachmentDataUrl(ATTACHMENTS_DIR, filePath, wasPickedByUser)
    }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Задача 3.27. Картинка из буфера обмена ОС. Пишется туда же, куда падают
// перетащенные, — иначе `attachments:read-data-url` откажется её читать для
// предпросмотра, и вставленная картинка окажется вложением без картинки.
// Пустой буфер — это ответ `path: ''`, а не ошибка: их композер показывает на
// него «в буфере нет картинки».
ipcMain.handle('attachments:save-clipboard', async () => {
  const image = clipboard.readImage()
  if (image.isEmpty()) return { ok: true, path: '' }
  try {
    return { ok: true, path: await saveAttachment(ATTACHMENTS_DIR, image.toPNG(), 'png') }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Ядро 0.21.3 (задача 3.B5в). Очень большая вставка текста — их композер
// превращает её в `.txt`-вложение (`use-composer-actions.ts`,
// `attachPastedText`). Их главный процесс пишет файл в свой каталог
// `composer-pastes`; у нас он падает туда же, куда картинки из буфера, —
// по той же причине: это единственный каталог, который окну потом дадут
// прочитать. Предел размера — тот же, что у любого вложения.
ipcMain.handle('attachments:save-paste', async (_event, payload: unknown) => {
  const { text } = (payload ?? {}) as { text?: unknown }
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, error: 'text must be a non-empty string' }
  }
  try {
    return {
      ok: true,
      path: await saveAttachment(ATTACHMENTS_DIR, Buffer.from(text, 'utf8'), 'txt')
    }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Задача 3E.26 (SPEC UR22, замечание D-75, пункт Б). Их кнопка «открыть
// предпросмотр в браузере». Стоит здесь, а не рядом с остальными обработчиками
// предпросмотра, из-за ATTACHMENTS_DIR: ветка с выгрузкой содержимого кладёт
// файл именно туда, и вторая копия этого пути была бы хуже соседства.
//
// ЧТО ЗДЕСЬ ОСЛАБЛЕНО — сказано словами в `preview-external-pure.ts` и в SPEC
// UR22: по нажатию человека HTML, произведённый агентом, исполняется в НАСТОЯЩЕМ
// браузере, вне наших границ. Осталось же правило «только показанное человеку»:
// какой файл открыть, окно не выбирает.
ipcMain.handle('preview:open-external', async (_event, value: unknown) => {
  const decision = decideOpenPreviewExternal(
    value,
    { attachmentsDir: ATTACHMENTS_DIR, projectRoot: currentProject?.vaultPath },
    wasPickedByUser
  )

  if (!decision.ok) return { ok: false, error: decision.error }

  // Файл на машине ядра здесь не существует: открыть его местным браузером
  // значило бы открыть чужой файл с тем же путём — или ничего.
  if (decision.url.startsWith('file:') && filesAreRemote()) {
    return { ok: false, error: 'Файл лежит на машине ядра — открыть его здесь нечем' }
  }

  try {
    await shell.openExternal(decision.url)

    // `exported` — окну, чтобы оно сказало человеку: содержимое вкладки ушло за
    // песочницу. Знает об этом главный процесс (он один видит, что путь лежит в
    // нашей папке выгрузки), а показать может только окно.
    return { exported: decision.staged, ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Задача 3.26 (находка D-42). Их тема красит НЕ только страницу: рамка окна,
// подложка до первой отрисовки и материал окна на macOS живут в главном
// процессе, и их `syncNativeTheme` держит их в согласии с выбранным режимом.
//
// `send`, а не `invoke`, потому что их контракт объявляет этот член
// возвращающим `void`, а их же вызов стоит ТЕЛОМ эффекта:
// `useEffect(() => syncNativeTheme(...), [...])`. Промис оттуда становится
// «функцией уборки» эффекта, и на ВТОРОМ срабатывании React зовёт его как
// функцию — приложение падало в их аварийный экран ровно на возврате темы ОС
// из тёмной в светлую. Отсюда правило: член, объявленный `=> void`, обязан
// возвращать `void`.
ipcMain.on('theme:set-native', (_event, mode: unknown) => {
  if (mode === 'system' || mode === 'light' || mode === 'dark') nativeTheme.themeSource = mode
})

// Задача 3.14. Разовые подсказки (звук конца хода, чтение ответа вслух)
// принадлежат ОДНОМУ окну: главный процесс — единственный, кто может решить
// гонку между ними. Разбор — `ambient-claim-pure.ts`.
const ambientClaims: ClaimState = new Map()

ipcMain.handle('ambient:claim', (_event, key: unknown) => claimCue(ambientClaims, key, Date.now()))

// Задача 3.12 (SPEC UR20). К какому ядру подключено приложение. Токен живёт
// только здесь: окну отдаётся признак «задан» и четыре последних знака.
ipcMain.handle('connection:get', () => connectionView())

// Задача 3.12. Имена из `~/.ssh/config` — те, что человек уже настроил сам.
// Приватные ключи при этом не открываются: `IdentityFile` для нас путь, а не
// содержимое (см. шапку `ssh-pure.ts`).
ipcMain.handle('connection:ssh-hosts', () => sshConfigHosts())
ipcMain.handle('connection:ssh-resolve', (_event, alias: unknown) => sshResolveHost(alias))

// Задача 3E.5 (UR31, риск R13). Адрес предпросмотра, который откроется ЗДЕСЬ.
// При удалённом ядре `localhost` в ответе агента означает петлю ТОЙ машины;
// разбор и проброс — в `ssh.ts`. Ответ всегда адрес: при локальном ядре или
// неподъёмном пробросе возвращается исходный, и человек видит обычную ошибку
// загрузки с адресом, который действительно не открылся.
ipcMain.handle('preview:reach', (_event, url: unknown) =>
  reachablePreviewUrl(typeof url === 'string' ? url : '')
)

// Задача 3.B4 (SPEC UR4, аннотации на предпросмотре). Снимок гостя
// `<webview>` для их режима «обвести и спросить». Гость обязан ПРИНАДЛЕЖАТЬ
// окну, которое просит: по номеру `webContents` можно назвать любой
// документ процесса, а снимать окно разрешено только своих гостей.
// Геометрия выреза — в `preview-capture-pure.ts`; здесь гость и отказы.
ipcMain.handle('preview:capture', async (event, payload: unknown) => {
  const value = payload as { rect?: unknown; viewport?: unknown; webContentsId?: unknown } | null
  const guest =
    typeof value?.webContentsId === 'number' ? webContents.fromId(value.webContentsId) : undefined
  if (!guest || guest.isDestroyed() || guest.hostWebContents?.id !== event.sender.id) {
    return { ok: false, error: 'Гость предпросмотра не найден' }
  }

  try {
    const image = await guest.capturePage()
    return { ok: true, dataUrl: cropCapture(image, value?.rect, value?.viewport) }
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Не удалось снять предпросмотр: ${error instanceof Error ? error.message : String(error)}`
    }
  }
})

// Задача 3E.8 (UR30, отменённый HX7). Живая оболочка терминала. Сессия
// принадлежит ОКНУ: закрыли окно — оболочки этого окна убиты (см. шапку
// `terminal.ts`). Цена канала названа в отменённом HX7 и принята владельцем;
// ответ на неё — R21, а не запрет здесь.
ipcMain.handle('terminal:start', (event, options: unknown) =>
  startTerminal(event.sender, options as never, currentProject?.vaultPath)
)
ipcMain.handle('terminal:write', (_event, id: unknown, data: unknown) => writeTerminal(id, data))
ipcMain.handle('terminal:resize', (_event, id: unknown, size: unknown) =>
  resizeTerminal(id, size as never)
)
ipcMain.handle('terminal:dispose', (_event, id: unknown) => disposeTerminal(id))
ipcMain.handle('terminal:cwd', (_event, id: unknown) => terminalCwd(id))

// Задача 3E.8 (UR30, отменённый HX12). Окно ОС под нашим — ТОЛЬКО метаданные.
// Контракт приватности и причина, по которой на macOS разрешение не
// запрашивается, — в шапке `os-windows.ts`.
ipcMain.handle('os-window:below', () =>
  readWindowBelow(BrowserWindow.getAllWindows().map((win) => win.webContents.getOSProcessId()))
)

ipcMain.handle('connection:save', (_event, input: unknown) => saveConnection(input))

// «Проверить» — до сохранения и без него. Иначе человек узнавал бы об
// опечатке в адресе только после того, как ею заменил рабочее подключение.
ipcMain.handle('connection:test', async (_event, input: unknown) => {
  const request = readConnectionInput(input)

  if (request.mode === 'local') return { ok: true, reachable: true }

  if (request.mode === 'ssh') {
    // Проверяется то, что человек СЕЙЧАС видит в форме, поверх сохранённого:
    // поля, которых в запросе не было, он не менял.
    const target = sshTargetOf({ ...sshSettings(), ...request.ssh })
    if (!target) return { ok: false, error: 'Не указана машина, к которой подключаться' }
    return probeSsh(target)
  }
  if (request.remoteUrl === '') return { ok: false, error: 'Адрес не похож на адрес сервера' }

  // Токен берётся из запроса, а если его там нет — сохранённый: человек может
  // проверять новый адрес со старым токеном, не набирая его заново.
  const token = request.remoteToken !== '' ? request.remoteToken : connectionToken()
  if (token === '') return { ok: false, error: 'Токен не задан' }

  try {
    const status = await hermesRest<{ version?: string }>(
      { host: '', port: 0, token, baseUrl: request.remoteUrl },
      '/api/status',
      { timeoutMs: 10000 }
    )
    return {
      ok: true,
      reachable: true,
      version: status?.version ?? null,
      baseUrl: request.remoteUrl
    }
  } catch (error: unknown) {
    return {
      ok: false,
      reachable: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

// «Применить» — это сохранить и переподключиться. Отдельный глагол их экрана:
// сохранённая, но не применённая настройка не должна молча менять то, с чем
// человек сейчас работает.
ipcMain.handle('connection:apply', async (_event, input: unknown) => {
  const outcome = saveConnection(input)
  if (!outcome.ok) return outcome

  // Настройка сохранена — но «применить» значит ПОДКЛЮЧИТЬСЯ, и неудача здесь
  // обязана вернуться отказом. Молчание превратило бы недоступный сервер в
  // бодрое «перезапускаю…», после которого не работает ничего.
  const connected = await reconnectForConnection()
  if (connected.ok) return outcome

  return { ...outcome, ok: false, error: connected.error, sshError: connected.sshError }
})

// Задача 3.7b. Табличка «микрофон слушает». Отдельное окно, потому что слово-
// активатор работает при свёрнутом главном: значок внутри свёрнутого окна не
// виден, то есть не делает своей работы.
ipcMain.on('wake-indicator:set', (_event, state: unknown) => setWakeIndicatorState(state))
ipcMain.handle('wake-indicator:get', () => wakeIndicatorState())

// Задача 3.24. Плавающая лента поверх чужих окон. Решения о границах и
// прозрачности — в `hud.ts` и `hud-pure.ts`.
ipcMain.handle('hud:open', (_event, request: unknown) =>
  openHud(
    (request ?? {}) as { sessionId?: unknown; profile?: unknown },
    process.env.ELECTRON_RENDERER_URL ?? rendererFileUrl()
  )
)
ipcMain.handle('hud:close', () => closeHud())
ipcMain.handle('hud:vibrancy', (_event, on: unknown) => setHudVibrancy(on))
ipcMain.on('hud:ignore-mouse', (_event, ignore: unknown) => setHudIgnoreMouse(ignore))
ipcMain.on('hud:begin-move', () => beginHudMove())
ipcMain.on('hud:end-move', () => endHudMove())
ipcMain.on('hud:move-by', (_event, delta: unknown) => moveHudBy(delta))
ipcMain.on('hud:set-bounds', (_event, bounds: unknown) => setHudBounds(bounds))
ipcMain.on('hud:set-session', (_event, value: unknown) => setHudSession(value))
ipcMain.handle('hud:get-state', () => hudState())

// Задача 3.14. Ещё одно окно приложения — полноценное, против того же ядра.
ipcMain.handle('window:open', () => {
  createWindow()
  return { ok: true }
})

// Окно одной сессии: открыть или, если оно уже есть, показать.
ipcMain.handle('window:open-session', (_event, payload: unknown) => {
  const { sessionId, watch } = (payload ?? {}) as { sessionId?: unknown; watch?: unknown }
  const planned = planSessionWindow(sessionId, { watch })
  if (!planned.ok) return { ok: false, error: planned.error }

  const key = `${String(sessionId)}${watch === true ? ':watch' : ''}`
  const existing = sessionWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return { ok: true }
  }

  const win = createWindow(planned.plan)
  sessionWindows.set(key, win)
  win.on('closed', () => sessionWindows.delete(key))
  return { ok: true }
})

// Задача 3E.5 (UR31). Вкладка браузера в своём окне: тот же рендерер с флагом
// `win=browser`, а не отдельная оболочка. Закрытие окна — сигнал их стороне
// вернуть вкладку в панель; без него вкладка осталась бы «где-то вынесенной»
// и исчезла бы из интерфейса совсем.
ipcMain.handle('window:open-browser', (_event, tabId: unknown) => {
  const planned = planBrowserWindow(tabId)
  if (!planned.ok) return { ok: false, error: planned.error }

  const key = String(tabId).trim()
  const existing = browserWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.focus()
    return { ok: true }
  }

  const win = createWindow(planned.plan)
  browserWindows.set(key, win)
  win.on('closed', () => {
    browserWindows.delete(key)
    for (const other of BrowserWindow.getAllWindows()) {
      if (!other.isDestroyed()) other.webContents.send('browser-popout:closed', key)
    }
  })
  return { ok: true }
})

// Задача 3.8а (SPEC UR29). Инструкции, которые проект несёт для агента.
ipcMain.handle('project-skills:get', () => projectSkillsView(currentProject?.vaultPath))
ipcMain.handle('project-skills:trust', (_event, trusted: unknown) =>
  setProjectSkillsTrust(currentProject?.vaultPath, trusted === true)
)

// Задача 3.6а. Кто запускает задачи по расписанию. Разбор — PLAN §«Свой тик
// расписаний»: тикает их планировщик в отдельном процессе, и человек решает,
// поднимать ли его.
ipcMain.handle('cron-runner:get', () => cronRunnerState())
ipcMain.handle('cron-runner:set', (_event, on: unknown) => setCronRunner(on))

// Задача 3.29. Журнал приложения. Три глагола их контракта: открыть папку,
// отдать хвост (их экран восстановления после неудачного старта показывает
// последние строки) и записать падение рендерера — единственную запись,
// приходящую снаружи главного процесса.
ipcMain.handle('log:reveal', async () => {
  const directory = logDirectory()
  if (directory === '') return { ok: false, path: '', error: 'журнал ещё не заведён' }
  const failure = await shell.openPath(directory)
  return failure === ''
    ? { ok: true, path: directory }
    : { ok: false, path: directory, error: failure }
})

ipcMain.handle('log:recent', () => recentLogs())

ipcMain.on('log:renderer-error', (_event, report: unknown) => logRendererError(report))

// Задача 3.28. Показ уведомления ОС. КОГДА показывать, решает их хранилище
// (виды, молчание при видимом окне, защита от повторов) — здесь только показ и
// маршрут щелчка. `false` значит «не показали», а не «сломалось».
ipcMain.handle('notify:show', (_event, payload: unknown) => showNativeNotification(payload))

// Задача 3.28. На батарее их страховочные опросы растягиваются вчетверо.
ipcMain.handle('power:on-battery', () => isOnBattery())

// Задача 3.27. Три глагола «наружу»: спросить место, сохранить картинку из
// ленты, сохранить файл агента. Решения — в `save-out-pure.ts`, работа с
// диалогом и диском — в `save-out.ts`; здесь только `currentProject`, которого
// ни тот, ни другой модуль не знает.
ipcMain.handle('dialog:select-save-path', async (event, request: unknown) =>
  selectSavePath(BrowserWindow.fromWebContents(event.sender) ?? undefined, request as never)
)

ipcMain.handle('save:image', async (event, payload: unknown) => {
  const { source } = (payload ?? {}) as { source?: unknown }
  return saveImageOut(
    BrowserWindow.fromWebContents(event.sender) ?? undefined,
    currentProject?.vaultPath,
    source
  )
})

ipcMain.handle('save:file', async (event, payload: unknown) => {
  const request = (payload ?? {}) as { path?: unknown; suggestedName?: unknown }
  return saveFileOut(
    BrowserWindow.fromWebContents(event.sender) ?? undefined,
    currentProject?.vaultPath,
    request
  )
})

// Task 3.17. Their composer adds files and folders to the context through
// `window.hermesDesktop.selectPaths`; the dialog runs HERE for the same reason
// `attach:pick` does — the renderer must never be handed a path it did not get
// from a human through a trusted dialog. What the request may ask for is
// translated by `planSelectPaths`, which is tested: a swapped
// `openFile`/`openDirectory` is a button doing the wrong thing quietly.
ipcMain.handle('dialog:select-paths', async (event, request: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const plan = planSelectPaths(request as SelectPathsRequest | undefined)
  const options = {
    ...(plan.title === undefined ? {} : { title: plan.title }),
    ...(plan.defaultPath === undefined ? {} : { defaultPath: plan.defaultPath }),
    ...(plan.filters === undefined ? {} : { filters: plan.filters }),
    properties: plan.properties as OpenDialogOptions['properties']
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled) return []

  // Задача 3.13b: главный процесс запоминает, что показал человеку. При
  // удалённом ядре вложение уедет байтами, и прочитать их можно будет только
  // потому, что этот файл выбрал человек, — а не потому, что окно назвало путь.
  for (const picked of result.filePaths) rememberPickedPath(picked)

  return result.filePaths
})

ipcMain.handle('project:pick-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  // Task 4D-11: main remembers what it just showed a human, so `project:create`
  // below can tell a chosen folder from one the renderer made up.
  rememberPickedPath(result.filePaths[0])
  return result.filePaths[0]
})

ipcMain.handle('project:create', async (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { dirPath, name, confirmed } = payload as Record<string, unknown>
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    return { ok: false, error: 'dirPath must be a non-empty string' }
  }
  if (!isAbsolute(dirPath)) {
    return { ok: false, error: 'путь к папке должен быть абсолютным' }
  }
  // Task 4D-11. The renderer may only name a folder a human picked in a native
  // dialog this process opened. Anything else — including a perfectly valid
  // absolute path — is refused, because "the window asked" is not evidence that
  // anyone chose it. See picked-paths.ts for why the guard is shaped this way.
  if (!wasPickedByUser(dirPath)) {
    return { ok: false, error: 'папку проекта нужно выбрать в диалоге выбора папки' }
  }
  if (typeof name !== 'string') {
    return { ok: false, error: 'name must be a string' }
  }

  // Task 1.5.4 (Obsidian-style init): a non-empty dirPath with its own
  // AGENTS.md/.aecpilot comes back as `needsConfirm` — surfaced as-is,
  // without touching currentProject/recents/scan scheduler, same shape as
  // sources:add's two-step confirm below.
  const result = createProject(dirPath, name, agentsTemplatePath(), {
    confirmed: confirmed === true
  })
  if ('needsConfirm' in result) return result
  if (!result.ok) return result

  currentProject = result.project
  // Задача 3.8а (UR29): в конфиге ядра стоят каталоги скилов РОВНО текущего
  // проекта — и только если он доверен и не менялся. Отсюда и «скилы одного
  // проекта не видны в другом», и «отзыв доверия отключает их немедленно».
  applyProjectSkills(result.project.vaultPath)
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

  // Находка D-47, послабленный вариант охранника: открыть можно то, что человек
  // выбрал в диалоге, ИЛИ то, что уже лежит в списке недавних. Строгая проверка
  // сломала бы открытие из недавних — там диалога не было; а доверять списку
  // можно потому, что ведёт его сам главный процесс: `recordRecent` зовётся
  // здесь, уже после успешного открытия, и окну до него не дотянуться.
  if (
    !wasPickedOrIsKnown(
      vaultPath,
      loadRecents().map((entry) => entry.vaultPath)
    )
  ) {
    return { ok: false, error: 'папку проекта нужно выбрать в диалоге выбора папки' }
  }

  // Task 1.5.4: a vaultPath with no .aecpilot/project.json yet comes back as
  // `needsInit` (not an error) — surfaced as-is, without touching
  // currentProject/recents/scan scheduler; the UI should offer to initialize
  // a project there via project:create instead.
  const result = openProject(vaultPath)
  if ('needsInit' in result) return result
  if (!result.ok) return result

  currentProject = result.project
  // Задача 3.8а (UR29): в конфиге ядра стоят каталоги скилов РОВНО текущего
  // проекта — и только если он доверен и не менялся. Отсюда и «скилы одного
  // проекта не видны в другом», и «отзыв доверия отключает их немедленно».
  applyProjectSkills(result.project.vaultPath)
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
  // Задача 3.13b. Сканер строит индекс по МЕСТНЫМ путям для ядра, которое
  // сейчас работает не здесь: индекс, который никто не спросит, из документов,
  // которых агент не видит. Решение 3.13a — серверная поставка (фаза 6), а до
  // неё честный отказ вместо бессмысленной работы.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  void scanScheduler.triggerNow()
  return { ok: true }
})

ipcMain.handle('scan:get-state', () => ({ scanning, lastReport: lastScanReport }))

ipcMain.handle('project:list-recents', () => loadRecents())

// Task 1.7: lists the current project's connected sources. Empty array if no
// project is open or the config can't be read/validated.
ipcMain.handle('sources:list', () => {
  // Источники — это папки ЭТОЙ машины, которые читают наши расширения. Их
  // запускает само ядро, значит при удалённом ядре они живут там же, и здешний
  // список к его работе отношения не имеет (решение 3.13a: серверная поставка,
  // фаза 6). Пустой список — не «источников нет», а «спрашивать надо не здесь»;
  // словами это говорит окно.
  if (filesAreRemote()) return []
  return currentProject ? listProjectSources(currentProject.vaultPath) : []
})

// Bugfix (owner manual run, block 6): a source added here only rewrites
// project.json — config.yaml's aec-sources `--project` arg stays the same
// path, so `registerAecSourcesForProject`'s "config unchanged" skip would
// never fire a reload for it, and the already-running aec-sources subprocess
// (which parsed project.json once, at its own startup) would keep serving
// its stale source list until the user switched projects and back. `reloadMcp`
// is called unconditionally here — best-effort, does not roll back the
// already-written project.json on failure — and deliberately does NOT reset
// the active chat session (see reloadMcp's doc comment): the project and cwd
// are unchanged, only the tool-backing data is, so the current session picks
// it up on its next tool call without losing history.
ipcMain.handle('sources:add', async (_event, payload: unknown) => {
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
  // Находка D-47. Тот же охранник, что у `project:create` (задача 4D-11), и по
  // той же причине: окно называет путь, но не выбирает его. Здесь ставка выше,
  // чем при создании проекта, — источник не просто подключается, он целиком
  // уходит в индекс, в embeddings и в запросы к модели. Присланное окном
  // `confirmed` согласием человека не является ровно по той же причине, по
  // какой им не является путь; оно управляет вторым шагом, а не доступом.
  // Настоящий экран уже ходит через `project:pick-directory`, так что рабочий
  // путь этим не задет (SourcesPanel.handleAdd).
  if (!wasPickedByUser(rootPath)) {
    return { ok: false, errors: ['папку источника нужно выбрать в диалоге выбора папки'] }
  }
  const result = await addSourceToProject(currentProject.vaultPath, rootPath, {
    confirmed: confirmed === true
  })
  if (!('needsConfirm' in result) && result.ok) await reloadMcp()
  return result
})

// Task 1.8 fix-iteration 1: cheap per-source availability check (no
// directory read) — the sidebar calls this once per connected source on
// load, so every source's "RO"/"недоступен" badge shows up without a manual
// expand, and without the cost of a full recursive tree build per source.
ipcMain.handle('sources:status', async (_event, payload: unknown) => {
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
// Bugfix (owner manual run, block 6): same reasoning as sources:add above —
// removing a source only rewrites project.json, so `reloadMcp` is called
// unconditionally (best-effort, no session reset) once that write succeeds.
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

  await reloadMcp()

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
ipcMain.handle('sources:tree', async (_event, payload: unknown) => {
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

// Task 1.5.5 (specs/workspace-sources.md § UI-операции): "Показать в
// проводнике" for a connected source's entry, at any nesting level
// (`rel: ''` targets the source's own root) — read-only, mirrors
// `vault:show-in-explorer` but resolved against the source's root instead of
// the vault.
ipcMain.handle('sources:show-in-explorer', async (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { sourceId, rel } = payload as Record<string, unknown>
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { ok: false, error: 'sourceId must be a non-empty string' }
  }
  if (typeof rel !== 'string') return { ok: false, error: 'rel must be a string' }
  const source = listProjectSources(currentProject.vaultPath).find((s) => s.id === sourceId)
  if (!source) return { ok: false, error: 'Источник не найден' }
  let absPath: string
  try {
    absPath = await resolveSourceEntryRel(source.root_path, rel)
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  shell.showItemInFolder(absPath)
  return { ok: true }
})

// Task 1.5.5: resolves a connected source's entry to its absolute path,
// backing "Копировать путь" — the renderer copies the returned path itself
// (via the clipboard), it never builds the path on its own.
ipcMain.handle('sources:get-entry-path', async (_event, payload: unknown) => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { sourceId, rel } = payload as Record<string, unknown>
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    return { ok: false, error: 'sourceId must be a non-empty string' }
  }
  if (typeof rel !== 'string') return { ok: false, error: 'rel must be a string' }
  const source = listProjectSources(currentProject.vaultPath).find((s) => s.id === sourceId)
  if (!source) return { ok: false, error: 'Источник не найден' }
  try {
    return { ok: true, path: await resolveSourceEntryRel(source.root_path, rel) }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Task 2.15: the index indicator and the ingest it starts.
//
// One run at a time, process-wide. Two concurrent ingests would race on the
// same `index.db` rows and on the same vector store, and the second one would
// mostly wait for SQLite anyway — «уже идёт» is a better answer than a queue
// nobody asked for.
let ingestState: IngestState = {
  error: null,
  lastReport: null,
  progress: null,
  running: false
}

function publishIngestState(next: Partial<IngestState>): void {
  ingestState = { ...ingestState, ...next }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('index:ingest-state', ingestState)
  }
}

ipcMain.handle('index:status', async () => {
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  try {
    const { runIndexStatus } = await import('./ingest-runner')
    return { ok: true, status: await runIndexStatus(currentProject.vaultPath) }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('quotes:check', async (_event, answer: unknown) => {
  // Несостоявшаяся проверка возвращается значением, а не исключением: рендерер
  // обязан отличать «выдержка не найдена» от «проверить не удалось», и второе
  // не должно выглядеть как первое.
  if (typeof answer !== 'string' || !answer.trim()) {
    return { available: false, reason: 'пустой ответ', quotes: [] }
  }
  if (!currentProject) return { available: false, reason: 'нет открытого проекта', quotes: [] }
  try {
    const { runQuoteCheck } = await import('./quote-check')
    const { HERMES_HOME_DIR } = await loadServeModule()
    return await runQuoteCheck(currentProject.vaultPath, answer, HERMES_HOME_DIR)
  } catch (error: unknown) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      quotes: []
    }
  }
})

ipcMain.handle('index:ingest-state', () => ingestState)

ipcMain.handle('index:ingest', async (_event, payload: unknown) => {
  if (!currentProject) return { started: false, error: 'Нет открытого проекта' }
  if (ingestState.running) return { started: false, error: 'Индексация уже идёт' }

  const full =
    typeof payload === 'object' && payload !== null && (payload as { full?: unknown }).full === true
  // Captured at start: the run belongs to the project it began against, and a
  // project switch mid-run must not make its report land on somebody else's
  // indicator (the same rule the scan runner already follows).
  const vaultPath = currentProject.vaultPath
  const { runIngest } = await import('./ingest-runner')

  publishIngestState({ error: null, progress: null, running: true })

  void runIngest(
    vaultPath,
    (progress) => {
      if (currentProject?.vaultPath !== vaultPath) return
      publishIngestState({ progress })
    },
    { full }
  )
    .then(({ report }) => {
      if (currentProject?.vaultPath !== vaultPath) {
        publishIngestState({ progress: null, running: false })
        return
      }
      publishIngestState({ lastReport: report, progress: null, running: false })
    })
    .catch((error: unknown) => {
      publishIngestState({
        error: error instanceof Error ? error.message : String(error),
        progress: null,
        running: false
      })
    })

  return { started: true }
})

// Задача 5.15: отметка папки или файла в граф из проводника.
//
// ПОРЯДОК ЗДЕСЬ И ЕСТЬ ТРЕБОВАНИЕ UR24. Сначала `graph:preview` — вопрос,
// который ничего не пишет и не индексирует; человек видит число документов и
// оценку фрагментов; и только его согласие заводит `graph:add`. Отказ — это
// просто отсутствие второго вызова, а не откат первого: откат пришлось бы
// писать и можно было бы забыть.
//
// Уровень 2 платный, поэтому состояние у него своё, а не общее с индексацией:
// «идёт индексация» и «строится граф» — разные новости, и вторая про деньги.
//
// Удалённый режим отдельной дверью не закрывается: дерево источников в нём не
// рисуется вовсе (SourcesPanel показывает вместо него объяснение), так что
// меню, из которого это зовут, там недостижимо.
let graphState: GraphAddState = {
  error: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false
}

function publishGraphState(next: Partial<GraphAddState>): void {
  graphState = { ...graphState, ...next }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('graph:add-state', graphState)
  }
}

/** Путь области графа собирает главный процесс, а не окно: он уезжает в
 *  project.json как выбор человека, и рендерер путей не строит. */
function markRequest(payload: unknown): ReturnType<typeof decideGraphMark> {
  if (!currentProject) return { error: 'Нет открытого проекта', ok: false }
  const sourceIds = listProjectSources(currentProject.vaultPath).map((source) => source.id)
  return decideGraphMark(payload, sourceIds)
}

ipcMain.handle('graph:preview', async (_event, payload: unknown) => {
  const request = markRequest(payload)
  if (!request.ok) return { error: request.error, ok: false }

  try {
    const { runGraphPreview } = await import('./graph-runner')
    const vaultPath = currentProject!.vaultPath
    return { ok: true, preview: await runGraphPreview(vaultPath, request.path, request.kind) }
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : String(error), ok: false }
  }
})

ipcMain.handle('graph:add-state', () => graphState)

ipcMain.handle('graph:add', async (_event, payload: unknown) => {
  const request = markRequest(payload)
  if (!request.ok) return { error: request.error, started: false }
  if (graphState.running) return { error: 'Граф уже строится', started: false }
  // Один процесс на индекс: ingest и граф пишут одни и те же таблицы и один и
  // тот же векторный стор (находка D-49 — та же причина, только там граница
  // стоит внутри сервера, а здесь между нашими процессами).
  if (ingestState.running) {
    return { error: 'Идёт индексация — граф строится после неё', started: false }
  }

  const vaultPath = currentProject!.vaultPath
  const { runGraphAdd } = await import('./graph-runner')

  publishGraphState({ error: null, path: request.path, progress: null, running: true })

  void runGraphAdd(vaultPath, request.path, request.kind, (progress) => {
    if (currentProject?.vaultPath !== vaultPath) return
    publishGraphState({ progress })
  })
    .then((report) => {
      if (currentProject?.vaultPath !== vaultPath) {
        publishGraphState({ path: null, progress: null, running: false })
        return
      }
      publishGraphState({ lastReport: report, path: null, progress: null, running: false })
    })
    .catch((error: unknown) => {
      publishGraphState({
        error: error instanceof Error ? error.message : String(error),
        path: null,
        progress: null,
        running: false
      })
    })

  return { started: true }
})

// --- Список фактов памяти проекта (задача 5.16) ----------------------------
//
// ПОСЛЕДОВАТЕЛЬНОСТЬ ЖИВЁТ ЗДЕСЬ, А НЕ В ОКНЕ. Список возможен только при
// остановленном ядре (встроенный qdrant держит папку исключительно — замер 5.4),
// значит чтение идёт «погасить → прочитать → поднять обратно». Окно вправе
// предупредить и спросить, но оставить машину без агента оно не вправе: подъём
// делает главный процесс.
//
// ИЗВЕСТНЫЙ КРАЙ: если окно закрыли целиком, пока список открыт, ядро останется
// погашенным до следующего закрытия списка или до перезапуска приложения. Лечить
// это обработчиком закрытия окна не стал — подъём ядра на пути выхода означал бы
// ждать здоровья шлюза ради процесса, который сейчас умрёт.
let memoryFactsOpen = false

// ЧТЕНИЕ И ПОДЪЁМ НЕ ДОЛЖНЫ НАЛОЖИТЬСЯ — это тот же урок, что находка D-49.
// Пока читатель держит папку хранилища, поднятое ядро НЕ получит своё хранилище
// обратно: его провайдер молча останется без backend (замер 5.16 — отказ приходит
// словами qdrant, а `is_available()` при этом отвечает True). Поэтому подъём ждёт
// текущего чтения, а не гонится с ним.
let memoryFactsRun: Promise<unknown> = Promise.resolve()

ipcMain.handle('memory:facts-read', async () => {
  const decision = decideFactsOpen({
    factsOpen: memoryFactsOpen,
    graphRunning: graphState.running,
    ingestRunning: ingestState.running,
    // Удалённое ядро — это и удалённое хранилище: гасить здесь нечего, а читать
    // нечего тем более (задача 3.12, правило 3.13b).
    remote:
      remoteTarget() !== undefined ||
      connectionMode() === 'ssh' ||
      Boolean(process.env.AEC_GATEWAY_URL)
  })
  if (!decision.ok) return { busy: false as const, error: decision.error, ok: false as const }

  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    const { HERMES_SRC_DIR, PYTHON_BIN } = await loadHermesEnvModule()
    const { runMemoryFacts } = await import('./memory-facts-runner')

    // Флаг ставится ДО остановки, а не после удачного чтения: с этой секунды ядро
    // может быть уже погашено, и подъём обратно обязан случиться — и когда список
    // не прочитан, и когда сама остановка кончилась отказом.
    memoryFactsOpen = true
    await stopBackend()

    const run = runMemoryFacts({
      args: ['list'],
      extraEnv: buildExtraEnv(),
      hermesHome: HERMES_HOME_DIR,
      hermesSrc: HERMES_SRC_DIR,
      python: PYTHON_BIN
    })
    memoryFactsRun = run.catch(() => undefined)
    return await run
  } catch (error: unknown) {
    console.error('aecpilot: could not read the project memory facts', error)
    return {
      busy: false as const,
      error: 'Не удалось прочитать память проекта',
      ok: false as const
    }
  }
})

ipcMain.handle('memory:facts-delete', async (_event, id: unknown) => {
  if (typeof id !== 'string' || id.trim() === '') {
    return { error: 'Не сказано, какой факт удалить', ok: false as const }
  }
  if (!memoryFactsOpen) {
    return {
      error: 'Ядро снова работает — удалять можно только при открытом списке',
      ok: false as const
    }
  }

  try {
    const { HERMES_HOME_DIR } = await loadServeModule()
    const { HERMES_SRC_DIR, PYTHON_BIN } = await loadHermesEnvModule()
    const { runMemoryFacts } = await import('./memory-facts-runner')

    // Ответ на удаление разбирается тем же кодом, что список: читателю важно
    // ровно `ok`/`error`, а список фактов в нём просто пуст.
    const run = runMemoryFacts({
      args: ['delete', id],
      extraEnv: buildExtraEnv(),
      hermesHome: HERMES_HOME_DIR,
      hermesSrc: HERMES_SRC_DIR,
      python: PYTHON_BIN
    })
    memoryFactsRun = run.catch(() => undefined)
    const answer = await run
    return answer.ok ? { ok: true as const } : { error: answer.error, ok: false as const }
  } catch (error: unknown) {
    console.error('aecpilot: could not delete a project memory fact', error)
    return { error: 'Не удалось удалить факт', ok: false as const }
  }
})

ipcMain.handle('memory:facts-close', async () => {
  if (!memoryFactsOpen) return { ok: true as const }

  memoryFactsOpen = false
  await memoryFactsRun
  const restarted = await restartBackend()
  return restarted.ok
    ? { ok: true as const }
    : { error: restarted.error ?? 'Не удалось поднять ядро обратно', ok: false as const }
})

// A document is opened for reading by size, not by trust: a citation names a
// file the agent chose, and the viewer has to load it whole into the renderer.
// 200 MiB is the indexer's own ceiling (aec_rag.indexer.DEFAULT_MAX_SIZE) — a
// file above it was never indexed, so no citation can legitimately point at one.
const MAX_VIEWER_BYTES = 200 * 1024 * 1024

/** Куда на диске смотрит запрос просмотрщика. Вынесено в общее место на задаче
 *  4.3: путь приходит из текста, написанного агентом, и проверка «не вышли ли
 *  мы за корень» не должна существовать в двух экземплярах — разъехавшись, они
 *  разъедутся именно в ту сторону, в какую нельзя.
 *
 *  Находка D-44: резолверы здесь именно СОДЕРЖИМОГО. Просмотрщик дальше зовёт
 *  `readFile`, а тот идёт ПО симлинку — поэтому проверять цепочку родителей,
 *  как это делают операции над самой сущностью (переименовать, удалить), тут
 *  мало: симлинк-лист внутри проекта увёл бы чтение на любой файл машины. */
async function resolveViewerPath(
  vaultPath: string,
  rel: string,
  sourceId: unknown
): Promise<{ absPath: string; ok: true } | { error: string; ok: false }> {
  try {
    if (typeof sourceId === 'string' && sourceId.length > 0) {
      const source = listProjectSources(vaultPath).find((s) => s.id === sourceId)
      if (!source) return { ok: false, error: `Источник «${sourceId}» не подключён` }
      return { absPath: await resolveSourceContentRel(source.root_path, rel), ok: true }
    }
    return { absPath: resolveVaultContentRel(vaultPath, rel), ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

// Task 2.14: reads a document for the viewer. `sourceId` names a connected
// source; without it the path is read from the vault. Resolution stays here —
// `rel` arrives from agent-authored citation text, which is exactly the input
// class the anti-traversal helpers exist for.
ipcMain.handle('viewer:read-document', async (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel, sourceId } = payload as Record<string, unknown>
  if (typeof rel !== 'string' || rel.length === 0) {
    return { ok: false, error: 'rel must be a non-empty string' }
  }

  // Задача 3.13b: ядро на другой машине — документ читается ТАМ. Цитата,
  // которая не открывается, ломает главный сценарий продукта, а открытая
  // «не та» — хуже: путь в цитате пришёл от ядра и относится к его машине.
  if (filesAreRemote()) return readRemoteDocument(restTarget(), rel)

  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }

  const resolved = await resolveViewerPath(currentProject.vaultPath, rel, sourceId)
  if (!resolved.ok) return resolved
  const absPath = resolved.absPath

  try {
    const stat = await fs.promises.stat(absPath)
    if (stat.isDirectory()) return { ok: false, error: 'Это папка, а не документ' }
    if (stat.size > MAX_VIEWER_BYTES) {
      return { ok: false, error: 'Файл слишком велик для просмотра' }
    }
    const bytes = await fs.promises.readFile(absPath)
    return {
      ok: true,
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      name: basename(absPath),
      path: absPath,
      size: stat.size
    }
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return { ok: false, error: 'Файл не найден' }
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, error: 'Нет доступа к файлу' }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Задача 4.3: XLSX разбирается здесь, а не в окне — exceljs это Node.
ipcMain.handle('viewer:read-sheets', async (_event, payload: unknown) => {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel, sourceId } = payload as Record<string, unknown>
  if (typeof rel !== 'string' || rel.length === 0) {
    return { ok: false, error: 'rel must be a non-empty string' }
  }

  // Книга приходит по сети целиком и разбирается здесь же, из байтов: файла на
  // этой машине нет, а класть его во временный только ради разбора значит
  // оставлять копию чужого документа у себя.
  if (filesAreRemote()) {
    const remote = await readRemoteDocument(restTarget(), rel)
    if (!remote.ok || !remote.bytes) return { ok: false, error: remote.error }
    const { readSheetsFromBuffer } = await import('./sheet-read')
    return readSheetsFromBuffer(Buffer.from(remote.bytes))
  }

  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }

  const resolved = await resolveViewerPath(currentProject.vaultPath, rel, sourceId)
  if (!resolved.ok) return resolved

  try {
    const stat = await fs.promises.stat(resolved.absPath)
    if (stat.isDirectory()) return { ok: false, error: 'Это папка, а не документ' }
    if (stat.size > MAX_VIEWER_BYTES) {
      return { ok: false, error: 'Файл слишком велик для просмотра' }
    }
    // Загружается по первой книге: пакет тяжёлый, а сессия без единого XLSX
    // платить за него не должна.
    const { readSheets } = await import('./sheet-read')
    return await readSheets(resolved.absPath)
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return { ok: false, error: 'Файл не найден' }
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, error: 'Нет доступа к файлу' }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

// Task 1.6: the vault explorer tree + file/folder create/rename/delete.
// Every handler is a no-op/`ok:false` when no project is open — the sidebar
// shows an empty-state instead of calling these, but a stale renderer call
// (e.g. after the project was closed mid-flight) must never throw.
ipcMain.handle('vault:tree', () => {
  // Задача 3.13b: при ядре на другой машине это дерево описывало бы НАШ диск.
  // Объяснение показывает окно (VaultExplorer); здесь важно, что чужих файлов
  // оно не получит даже от рендерера, который не в курсе.
  if (filesAreRemote()) return []
  if (!currentProject) return []
  try {
    return buildVaultTree(currentProject.vaultPath)
  } catch (error: unknown) {
    console.error('aecpilot: could not build vault tree', error)
    return []
  }
})

ipcMain.handle('vault:create-file', (_event, payload: unknown) => {
  // Задача 3.13b: писать на диск ЭТОЙ машины, пока агент работает на другой,
  // значит править не те файлы. Отказ с причиной, а не тихая запись мимо.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
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
  // Задача 3.13b: писать на диск ЭТОЙ машины, пока агент работает на другой,
  // значит править не те файлы. Отказ с причиной, а не тихая запись мимо.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
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

// Задача 4.5: сохранение из MD-редактора.
ipcMain.handle('vault:write-file', (_event, payload: unknown) => {
  // Задача 3.13b: писать на диск ЭТОЙ машины, пока агент работает на другой,
  // значит править не те файлы. Отказ с причиной, а не тихая запись мимо.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel, text } = payload as Record<string, unknown>
  if (typeof rel !== 'string' || rel.length === 0) {
    return { ok: false, error: 'rel must be a non-empty string' }
  }
  if (typeof text !== 'string') return { ok: false, error: 'text must be a string' }

  try {
    writeVaultFile(currentProject.vaultPath, rel, text)
    return { ok: true }
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return { ok: false, error: 'Файл не найден' }
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, error: 'Нет доступа к файлу' }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('vault:rename', (_event, payload: unknown) => {
  // Задача 3.13b: писать на диск ЭТОЙ машины, пока агент работает на другой,
  // значит править не те файлы. Отказ с причиной, а не тихая запись мимо.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
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
  // Задача 3.13b: писать на диск ЭТОЙ машины, пока агент работает на другой,
  // значит править не те файлы. Отказ с причиной, а не тихая запись мимо.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
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
  // Проводник открылся бы ЗДЕСЬ, а файл лежит там. Пустая папка вместо ответа —
  // это не «показали», это молчаливая неправда.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
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

// Task 1.5.7: resolves a vault entry to its absolute path, backing the
// context menu's "Копировать путь" for a vault node — mirrors
// `sources:get-entry-path`'s contract exactly (the renderer never builds the
// path itself).
ipcMain.handle('vault:get-entry-path', (_event, payload: unknown) => {
  // Путь этой машины для файла на той — та же неправда, только в виде строки.
  if (filesAreRemote()) return { ok: false, error: FILES_LIVE_ON_CORE_MACHINE }
  if (!currentProject) return { ok: false, error: 'Нет открытого проекта' }
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'invalid payload' }
  }
  const { rel } = payload as Record<string, unknown>
  if (typeof rel !== 'string') return { ok: false, error: 'rel must be a string' }
  try {
    return { ok: true, path: resolveVaultEntryRel(currentProject.vaultPath, rel) }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

/** Task 3.7a. Electron grants every permission a page asks for while no handler
 * is installed, so until this ran the window could have taken geolocation, MIDI,
 * screen capture or window management without anyone deciding. The rules live in
 * `media-permission-pure.ts`; both callbacks are needed because most web APIs
 * check first and only then request. */
function installPermissionPolicy(): void {
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const kinds = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(isAllowedPermission(permission, kinds))
  })

  ses.setPermissionCheckHandler((_contents, permission, _origin, details) => {
    const kind = details.mediaType
    return isAllowedPermission(permission, kind && kind !== 'unknown' ? [kind] : [])
  })
}

// Задача 3.13b: схема для звука и видео с машины ядра. Регистрируется ДО
// готовности приложения — позже `<video>` уже не примет её как источник потока.
registerMediaScheme()

app
  .whenReady()
  .then(async () => {
    // Проигрывателю нужен источник с перемоткой, а не файл в памяти; токен при
    // этом остаётся здесь (SPEC C9). Разбор — `media-proxy.ts`.
    installMediaProtocol(session.defaultSession, restTarget)

    // Задача 3.29. Первым делом: всё, что записано раньше, в журнал не попадёт,
    // а самое интересное происходит как раз на старте.
    console.log(`aecpilot: app log at ${installAppLog(app.getPath('logs'))}`)

    // Задача 3.12: к какому ядру подключаться, решается ДО того, как что-то
    // запускается: в удалённом режиме свой процесс не поднимается вовсе.
    configureConnection({
      userDataDir: app.getPath('userData'),
      secure: safeStorage,
      envOverride: Boolean(process.env.AEC_GATEWAY_URL)
    })

    // Задача 3.8а: где лежит их конфиг и где мы храним доверие. Модуль шлюза
    // грузится тут же, откуда его берут все остальные — он знает их домашний
    // каталог, а мы этот путь не выдумываем.
    configureProjectSkills({
      homeDir: (await loadServeModule()).HERMES_HOME_DIR,
      userDataDir: app.getPath('userData')
    })

    installPermissionPolicy()

    // AEC_SMOKE: fast UI-only smoke test — skip the hermes backend entirely.
    if (process.env.AEC_SMOKE !== '1') {
      // AEC_GATEWAY_URL (task 0.16, Playwright e2e): point the gateway
      // client at a pre-started server (a mock gateway in tests) instead of
      // spawning `hermes serve`. serveHandle/stopServeFn stay undefined in
      // this mode — existing shutdown guards already tolerate that.
      const remote = remoteTarget()

      if (process.env.AEC_GATEWAY_URL) {
        console.warn('aecpilot: AEC_GATEWAY_URL override active — skipping hermes serve')
        await connectGateway(process.env.AEC_GATEWAY_URL)
      } else if (connectionMode() === 'ssh') {
        // Задача 3.12: ядро поднимается на той машине. Отказ здесь не должен
        // мешать окну открыться — человек увидит его и сможет починить
        // настройку; окно, не открывшееся из-за недоступного сервера, чинить
        // нечем.
        console.log('aecpilot: connecting over ssh')
        const outcome = await connectViaSsh()
        if (!outcome.ok) console.warn('aecpilot: ssh connect FAIL', outcome.error)
      } else if (remote) {
        // Задача 3.12: ядро на другой машине — свой процесс не нужен.
        console.log('aecpilot: connecting to a remote gateway')
        await connectGateway(wsUrlFor(remote.baseUrl, remote.token))
      } else {
        try {
          const { startServe, waitHealthy, stopServe, HERMES_HOME_DIR } = await loadServeModule()
          stopServeFn = stopServe

          // Task 0.15: apply any saved model/endpoint override to the profile's
          // config.yaml (plaintext — not a secret) and pass a decrypted API key
          // (if one is stored) into the child process env only — never written
          // to disk. This must happen before startServe spawns hermes.
          applyModelConfigOverride(HERMES_HOME_DIR, loadLlmSettings())
          applyDefaultSpeechVoice(HERMES_HOME_DIR)
          applyDefaultWakePhrase(HERMES_HOME_DIR)
          applyRunBudget(HERMES_HOME_DIR)
          applyLoopBudget(HERMES_HOME_DIR)
          applyCoreOptOuts(HERMES_HOME_DIR)
          applyWebBackend(HERMES_HOME_DIR)
          applyBrowserBackend(HERMES_HOME_DIR)
          applyApprovalsMode(HERMES_HOME_DIR)
          applyKanbanToolset(HERMES_HOME_DIR)
          applyVideoToolset(HERMES_HOME_DIR)
          applyDisabledToolsets(HERMES_HOME_DIR)

          // Задача 5.3 (спека `agent-memory.md`, сценарий «Фильтр секретов»):
          // плагин-отказ на записи в память ставится ДО подъёма ядра. Замерено
          // по их же коду: `discover_plugins()` держит флаг `_discovered` и
          // повторно сканирует папку только с `force=True`, которого на пути
          // шлюза нет, — значит поставленный после старта фильтр молчал бы до
          // следующего запуска приложения. Здесь же, рядом с остальными
          // записями в профиль, он попадает в ту же самую подготовку.
          //
          // Отдельным try — и это НЕ «на всякий случай»: сорваться установка
          // может ровно одним способом, отсутствием исходника плагина рядом
          // (тот же вопрос упакованного приложения, что у loadServeModule), и
          // приложение, не открывшееся из-за этого, не защитит никого. Отказ
          // громко пишется в лог; тихой замены фильтра на его отсутствие тут
          // нет только благодаря этой строке.
          try {
            const { installSecretFilter } = await loadSecretFilterModule()
            installSecretFilter(HERMES_HOME_DIR)
          } catch (error: unknown) {
            console.error(
              'aecpilot: SECRET FILTER NOT INSTALLED, memory writes are unfiltered',
              error
            )
          }

          serveHandle = await startServe({ extraEnv: buildExtraEnv() })

          // startServe only spawns the process — the gateway WS endpoint isn't
          // accepting connections yet. Wait until it's healthy before connecting:
          // GatewayClient does not retry a failed *initial* connect (auto-reconnect
          // only engages after the first successful 'ready'), so connecting too
          // early leaves the app permanently disconnected.
          //
          // Four minutes rather than the 30 s this used to allow. The budget is
          // for the FIRST launch after an install, and 30 s turned out to be
          // thin: measured on this machine, a warm start is 2.1 s, a start with
          // the core's bytecode cache wiped is 8.5 s — and the one run that
          // actually blew the limit was the first launch after writing the
          // core's 217 MB to disk, which no measurement here reproduces (a
          // virus scanner reading a freshly written tree is the standing
          // suspect). Waiting costs nothing when the gateway is quick; giving
          // up early costs the user a window that never connects, with only a
          // console line to say why. Surfacing the wait in the UI belongs to
          // the migrated shell (task 1.8.15), not to a screen we are replacing.
          await waitHealthy(serveHandle, 240000)

          // SECURITY: serveHandle.wsUrl embeds the gateway auth token
          // (?token=…). It stays in the main process only — never send it over
          // IPC and never log this url or any error that could carry it. The
          // `gateway connect FAIL` log inside connectGateway is safe only
          // because GatewayClient errors do not include the url; keep that
          // invariant if you touch it.
          await connectGateway(serveHandle.wsUrl)

          // Задача 3.6а. Их планировщик живёт в отдельном процессе, и человек
          // решает, поднимать ли его. Поднимается ПОСЛЕ шлюза: задача,
          // стрельнувшая раньше, чем ядро готово, не найдёт, к чему обратиться.
          const { HERMES_BIN } = (await import(
            /* @vite-ignore */ pathToFileURL(join(__dirname, '../../../../runtime/hermes-env.mjs'))
              .href
          )) as { HERMES_BIN: string }

          const runner = restoreCronRunner({
            binary: HERMES_BIN,
            homeDir: HERMES_HOME_DIR,
            userDataDir: app.getPath('userData')
          })
          if (runner.enabled) console.log('aecpilot: cron runner restored')
        } catch (error: unknown) {
          // Backend failing to start must not take the window down — the chat
          // just won't be able to connect yet (see task 0.8).
          console.error('aecpilot: hermes serve start FAIL', error)
        }
      }
    }

    // Задача 3E.11: та же причина, что у «не засыпать» ниже — выключатель,
    // который надо щёлкать каждый запуск, это не настройка, а напоминание о
    // себе. Читается ДО первого окна, чтобы настройка была в силе с первого
    // нажатия, а не со второго.
    if (restoreDevtoolsBlocked()) console.log('aecpilot: F12 blocked')

    // Задача 3E.10: до первого окна — Chromium читает список языков сессии,
    // когда окно уже есть, и настройка после него не догоняет первый ввод.
    const spellcheck = configureSpellChecker()
    console.log(
      spellcheck.length > 0
        ? `aecpilot: spellcheck ${spellcheck.join(', ')}`
        : 'aecpilot: spellcheck left to the system'
    )

    // Задача 3E.5 (риск R22): надзор за встроенной страницей ставится ДО
    // первого окна. `web-contents-created` не отдаёт уже созданных, и гость,
    // родившийся раньше подписки, ушёл бы куда угодно без вопроса.
    installPreviewGuestGuard()

    createWindow()
    console.log('aecpilot: window created')

    // Task 3.15. Registered after the window exists, because the shortcut's
    // whole job is to summon a capture box that submits into this app's
    // session. A chord another app already owns is reported, not retried —
    // silently losing a global hotkey is how a feature becomes a bug report.
    const quick = registerQuickEntry(
      { enabled: true },
      process.env.ELECTRON_RENDERER_URL ? { rendererUrl: process.env.ELECTRON_RENDERER_URL } : {}
    )
    console.log(
      quick.enabled
        ? `aecpilot: quick entry on ${quick.shortcut}`
        : `aecpilot: quick entry off (${quick.reason})`
    )

    // Task 3.18: an overnight run must survive a restart of the app, so the
    // blocker comes back from main's own copy of the preference.
    if (restoreKeepAwake()) console.log('aecpilot: keep-awake restored')

    // Задача 3.6а: состояние планировщика видно в интерфейсе, поэтому его смена
    // доезжает до окна сама — включая неожиданный выход процесса.
    onCronRunnerChanged((state) => broadcastToWindows('cron-runner:changed', state))

    // Задача 3.24: обе стороны должны знать, открыта ли лента, — иначе
    // переключатель в заголовке главного окна расходится с правдой, когда её
    // закрыли из неё самой.
    onHudChanged((state) => broadcastToWindows('hud:changed', state))

    // Task 3.28: the OS side of working in the background.
    installNotifications()
    installPowerWatch({
      onBatteryChanged: (value) => broadcastToWindows('power:battery-changed', value),
      onResume: () => {
        broadcastToWindows('power:resume', undefined)
        void revalidateGatewayAfterResume()
      }
    })

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

// Task 3.15: hand the chord back to the OS. Electron does this on exit anyway,
// but not on a quit that hangs on the backend shutdown below — and a shortcut
// still held by a closing app is a shortcut nobody else can take.
app.on('will-quit', () => {
  unregisterQuickEntry()
  releaseKeepAwake()
  // Задача 3.6а: осиротевший планировщик, продолжающий запускать задачи агента
  // после закрытия окна, — это не «работа в фоне», а потеря контроля.
  stopCronRunner()
  // Задача 3.12: та же причина, но на чужой машине — ядро, оставшееся там
  // работать после закрытия окна, не остановит уже никто.
  void stopSshTunnel()
  stopHud()
  // Табличка, пережившая программу, сообщает о микрофоне, которого больше нет.
  stopWakeIndicator()
  // Задача 3D.4: опрос роестра — такой же таймер, как планировщик выше, и
  // пережить закрытие он не должен.
  stopRosterSnapshotPolling()
})

/** Задача 3E.11. Диалог отдельно от правила: правило проверяется тестом
 * (`quit-guard-pure.ts`), модальное окно — нет. «Остаться» стоит по умолчанию и
 * на Escape: случайный Enter не должен убивать час работы агента. */
function confirmQuitDespiteWork(prompt: QuitPrompt): boolean {
  return (
    dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Выйти', 'Остаться'],
      defaultId: 1,
      cancelId: 1,
      message: prompt.message,
      detail: prompt.detail
    }) === 0
  )
}

app.on('before-quit', (event) => {
  // Задача 3E.11 (UR35). Спрашиваем ЗДЕСЬ и ДО остановки ядра: ниже по этому же
  // обработчику она уже начинается, и вопрос после неё был бы вопросом о
  // работе, которую мы только что убили.
  //
  // Только когда ядро НАШЕ (`serveHandle`): при удалённом ядре ход идёт на
  // чужой машине, наш выход его не прерывает, и терять нечего.
  if (!quitting && serveHandle) {
    const prompt = quitPromptFor(mergeActiveWork(activeWorkByWindow.values()))
    if (prompt && !confirmQuitDespiteWork(prompt)) {
      event.preventDefault()
      // На Windows и Linux выход приходит ПОСЛЕ закрытия последнего окна
      // (`window-all-closed` выше), поэтому «остаться» без этой строки оставило
      // бы работающее приложение без единого окна. Окно открывается заново, а
      // не «не закрывается»: к моменту вопроса прежнее уже уничтожено.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      return
    }
  }

  // Задача 3E.8: оболочки закрываются раньше ядра и раньше любого возврата
  // ниже. Выход с живым `cmd.exe` за спиной оставил бы процесс без хозяина.
  disposeAllTerminals()

  if (quitting || !serveHandle || !stopServeFn) return
  event.preventDefault()
  quitting = true
  const handle = serveHandle
  serveHandle = undefined
  stopServeFn(handle)
    .catch(() => {})
    .finally(() => app.quit())
})
