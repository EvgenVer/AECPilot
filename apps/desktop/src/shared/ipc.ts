// Renderer-facing IPC surface exposed by the preload script (task 0.11). The
// renderer never sees the gateway URL/token or the raw `ipcRenderer` — only
// these methods, contextBridge-exposed as `window.aecpilot`.

import type {
  GatewayConnectionState,
  GatewayEvent,
  HistoryMessage,
  SessionSummary
} from './gateway/types'

/** The currently-open project (tasks 1.3/1.4) — set by `createProject` or
 * `openProject`. */
export interface OpenProject {
  name: string
  vaultPath: string
}

/** An entry in the "recent projects" list (task 1.3/1.4). */
export interface RecentProject {
  name: string
  vaultPath: string
  openedAt: string
}

/** A connected source of the current project (task 1.7) — mirrors
 * `ProjectSource` from `../project/project-config`, redeclared here (same
 * pattern as `OpenProject`/`RecentProject` above) so the renderer/preload
 * layers don't import main-only modules. */
export interface ProjectSource {
  id: string
  root_path: string
  added_at: string
}

/** A node in the vault explorer tree (task 1.6) — mirrors `VaultTreeNode`
 * from `../main/vault-fs`, redeclared here for the same reason as
 * `ProjectSource` above. `path` is a posix-style (`/`-separated) rel path
 * from the vault root, used as-is for every `vault:*` IPC call that takes a
 * `rel`/`parentRel`. */
export interface VaultTreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: VaultTreeNode[]
}

/** A node in a connected source's directory tree (task 1.8) — mirrors
 * `SourceTreeNode` from `../main/source-tree`, redeclared here for the same
 * reason as `ProjectSource` above. */
export interface SourceTreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: SourceTreeNode[]
}

/** Result of `getSourceTree` (task 1.8): `status: 'unavailable'` means the
 * source's root can't currently be reached (path gone, network share
 * dropped, permission revoked, …) — the rest of the app keeps working; an
 * unknown `sourceId` comes back as `ok: false`. */
export type SourceTreeResult =
  | { ok: true; status: 'ok'; tree: SourceTreeNode[] }
  | { ok: true; status: 'unavailable' }
  | { ok: false; error: string }

/** Result of `getSourceStatus` (task 1.8 fix-iteration 1) — same `status`
 * meaning as `SourceTreeResult`, without the tree; cheap enough to call for
 * every connected source on load. */
export type SourceStatusResult =
  { ok: true; status: 'ok' | 'unavailable' } | { ok: false; error: string }

/** Result of a vault write operation (create/rename/delete/show-in-explorer,
 * task 1.6). `error` is a human-readable, Russian message suitable for
 * display next to the explorer toolbar. */
export type VaultOpResult = { ok: true } | { ok: false; error: string }

/** One source's change report from an `aec-rag scan` run (task 1.14) —
 * mirrors `scan_source`'s return shape (mcp/aec_rag/src/aec_rag/indexer.py):
 * `root_unavailable` means the source's root couldn't be reached during this
 * scan (network share dropped, …) — every other field stays at its default
 * in that case, the existing index is left untouched. */
export interface SourceScanReport {
  added: string[]
  changed: string[]
  deleted: string[]
  unchanged: number
  root_unavailable: boolean
}

/** Full report of one scan cycle (task 1.14): one `SourceScanReport` per
 * connected source, keyed by source id. Consumed by task 1.15's
 * change-notification UI; this task only makes it available (broadcast +
 * last-report snapshot). */
export interface ScanReport {
  sources: Record<string, SourceScanReport>
}

/** A `ScanReport` tagged with the vault it belongs to (task 1.15 fix-iteration
 * 1, review major): `main`'s scan runner captures `vaultPath` at the moment a
 * scan *starts* (not when it completes), so a scan that began against
 * project A stays tagged A even if the user switches to project B before it
 * finishes — `scan:report`/`scan:get-state` always carry this envelope, never
 * a bare `ScanReport`, so a late report can never be mistaken for the
 * now-current project's. Consumers (`ScanNotification`) must drop an
 * envelope whose `vaultPath` doesn't match the currently-open project. */
export interface ScanReportEnvelope {
  vaultPath: string
  report: ScanReport
}

export interface AecpilotApi {
  /** Whether to show the Welcome/"choose a project" screen instead of the
   * workspace shell (task 1.0). Read once from `process.env.AEC_SHOW_WELCOME`
   * at preload time — there is no project system yet (Phase 1.3/1.4), so
   * this is a dev-only flag to preview the Welcome screen; the normal
   * autostart-into-shell flow (and e2e) is unaffected when it's unset. */
  showWelcome: boolean
  /** Submits a prompt to the (lazily created) chat session. Resolves once
   * the gateway has accepted it for streaming; rejects on failure. */
  submitPrompt(text: string): Promise<void>
  /** Subscribes to streamed gateway events for the active chat session.
   * Returns an unsubscribe function. */
  onChatEvent(cb: (event: GatewayEvent) => void): () => void
  /** Subscribes to gateway connection state changes. Returns an unsubscribe
   * function. */
  onGatewayState(cb: (state: GatewayConnectionState) => void): () => void
  /** Reads the gateway's current connection state once. Needed because the
   * initial 'ready' can be reached before this renderer subscribes (main
   * connects the gateway before the window exists), so the renderer hydrates
   * from this on mount instead of waiting for the next change event. */
  getGatewayState(): Promise<GatewayConnectionState>
  /** Responds to the oldest pending `approval.request` for the active
   * session (or all of them, with `all: true`). `choice` must only be
   * 'always' when the matching request's `allow_permanent` was true. */
  respondApproval(
    choice: 'once' | 'session' | 'always' | 'deny',
    all?: boolean
  ): Promise<{ resolved: number }>
  /** Lists existing sessions, in the order returned by the gateway.
   * Internal 'tool' sub-agent sessions are already filtered out server-side. */
  listSessions(): Promise<{ sessions: SessionSummary[] }>
  /** Creates a brand-new session and makes it the active one. */
  newSession(): Promise<{ sessionId: string }>
  /** Switches the active session to `id`, returning its resumed history.
   * The gateway may hand back a different live session id than the one
   * passed in — callers should treat the returned `sessionId` as active. */
  switchSession(id: string): Promise<{ sessionId: string; messages: HistoryMessage[] }>
  /** Reads the current LLM settings (task 0.15). Never carries the API key
   * itself — only `hasKey` (whether one is stored) and `encryptionAvailable`
   * (whether safeStorage can save one on this machine). `envOverridesKey`
   * is true when the hermes profile's dev `.env` already assigns the
   * provider's credential env var, which takes priority over any key saved
   * here — the UI should warn about this. */
  getLlmSettings(): Promise<{
    model?: string
    baseUrl?: string
    hasKey: boolean
    encryptionAvailable: boolean
    envOverridesKey: boolean
  }>
  /** Saves LLM settings and restarts the hermes backend to apply them
   * (skipped under the `AEC_GATEWAY_URL` e2e override, where `restarted` is
   * always false). `key: string` sets a new key, `key: null` clears it,
   * `key` omitted leaves the stored key untouched. */
  saveLlmSettings(payload: {
    model?: string
    baseUrl?: string
    key?: string | null
  }): Promise<{ ok: boolean; restarted: boolean; error?: string }>
  /** Reads the hermes profile's current `approvals.mode` from `config.yaml`
   * (task 0.17). A plain file read in the main process — no gateway RPC
   * involved — so it works the same whether or not `hermes serve` is
   * running under this app. Falls back to `'manual'` (hermes's own default)
   * if the file can't be read. */
  getApprovalsMode(): Promise<{ mode: 'manual' | 'smart' | 'off' }>
  /** Writes `mode` into the profile's `config.yaml` `approvals:` mapping.
   * hermes re-reads config.yaml per command, so this applies live — no
   * backend restart is triggered or needed. */
  setApprovalsMode(
    mode: 'manual' | 'smart' | 'off'
  ): Promise<{ ok: boolean; mode?: string; error?: string }>
  /** Opens a native "choose folder" dialog for the create-project flow (task
   * 1.3). The dialog allows creating a new folder. Returns `null` if the
   * user cancels. */
  pickProjectDirectory(): Promise<string | null>
  /** Creates a new vault at `dirPath` (must be an empty directory) named
   * `name`, records it as the most-recent project, and makes it the current
   * open project (see `onProjectOpened`). `error` is a human-readable
   * message suitable for display in the create-project dialog. */
  createProject(
    dirPath: string,
    name: string
  ): Promise<{ ok: true; project: OpenProject } | { ok: false; error: string }>
  /** Reads the currently-open project, if any. */
  getCurrentProject(): Promise<OpenProject | null>
  /** Lists recently created/opened projects, most-recent first. */
  listRecentProjects(): Promise<RecentProject[]>
  /** Subscribes to "a project was created/opened" events (task 1.3/1.4).
   * Returns an unsubscribe function. */
  onProjectOpened(cb: (project: OpenProject) => void): () => void
  /** Opens an existing vault at `vaultPath` (must contain a valid
   * `.aecpilot/project.json`, task 1.4), records it as the most-recent
   * project, and makes it the current open project (see `onProjectOpened`).
   * Re-opening the already-open project is a no-op success. `error` is a
   * human-readable message suitable for display next to the recents entry or
   * the open-project action. */
  openProject(
    vaultPath: string
  ): Promise<{ ok: true; project: OpenProject } | { ok: false; error: string }>
  /** Lists the current project's connected sources (task 1.7). Empty array
   * if no project is open. */
  listSources(): Promise<ProjectSource[]>
  /** Adds `rootPath` as a new read-only source of the current project (task
   * 1.7). `confirmed` must be `true` to proceed past a warning (path
   * overlaps an existing source, or is currently inaccessible) previously
   * returned as `needsConfirm` — call again with the same `rootPath` and
   * `confirmed: true` to add it anyway. Errors (nesting inside the vault,
   * exact duplicate, no open project) always block, regardless of
   * `confirmed`. */
  addSource(
    rootPath: string,
    confirmed?: boolean
  ): Promise<
    | { ok: true; sources: ProjectSource[] }
    | { ok: false; errors: string[] }
    | { needsConfirm: string[] }
  >
  /** Checks whether a connected source's root is currently reachable (task
   * 1.8 fix-iteration 1) — cheap, meant to be called once per source right
   * after `listSources` so the sidebar can show every source's "недоступен"
   * badge without a manual expand. */
  getSourceStatus(sourceId: string): Promise<SourceStatusResult>
  /** Reads a connected source's directory tree (task 1.8) — read-only, no
   * write operations exist for a source (RO by construction, see
   * specs/workspace-sources.md's "Гарантия read-only"). Symlinks are shown
   * as a leaf, never traversed. */
  getSourceTree(sourceId: string): Promise<SourceTreeResult>
  /** Reads the current project's vault file tree (task 1.6). Empty array if
   * no project is open. `.aecpilot` is always hidden; symlinks are shown as
   * a leaf, never traversed. */
  getVaultTree(): Promise<VaultTreeNode[]>
  /** Creates an empty file named `name` inside `parentRel` (rel path from
   * the vault root; omitted/`''` means the vault root). */
  createVaultFile(parentRel: string | undefined, name: string): Promise<VaultOpResult>
  /** Creates a new folder named `name` inside `parentRel` — same contract as
   * `createVaultFile`. */
  createVaultDir(parentRel: string | undefined, name: string): Promise<VaultOpResult>
  /** Renames the file/folder at `rel` to `newName`, staying in the same
   * parent folder. */
  renameVaultEntry(rel: string, newName: string): Promise<VaultOpResult>
  /** Moves the file/folder at `rel` to the OS recycle bin — never a
   * permanent delete. The caller is expected to confirm with the user
   * first. */
  deleteVaultEntry(rel: string): Promise<VaultOpResult>
  /** Opens the OS file manager with the item at `rel` highlighted
   * (specs/workspace-sources.md § API contracts, UI operations) —
   * read-only, never modifies the vault. */
  showVaultEntryInExplorer(rel: string): Promise<VaultOpResult>
  /** Reads the scan scheduler's current state (task 1.14): whether a scan is
   * in flight right now, and the most recent completed report (`null` if no
   * scan has finished yet this session, or the project was switched since —
   * `main` resets it on every project switch). Mirrors `getGatewayState`'s
   * hydrate-on-mount pattern — a scan can start/finish before the renderer
   * subscribes to `onScanState`/`onScanReport`. */
  getScanState(): Promise<{ scanning: boolean; lastReport: ScanReportEnvelope | null }>
  /** "Сканировать сейчас" — triggers an immediate scan of the current
   * project's sources. A no-op (still `ok: true`) if a scan is already in
   * flight; `ok: false` if no project is open. Resolves as soon as the scan
   * is *requested*, not once it completes — watch `onScanState`/
   * `onScanReport` for the outcome. */
  triggerScan(): Promise<{ ok: boolean; error?: string }>
  /** Subscribes to "a scan started/finished" state changes (task 1.14) — the
   * UI's minimal "идёт сканирование" indicator. Returns an unsubscribe
   * function. */
  onScanState(cb: (scanning: boolean) => void): () => void
  /** Subscribes to completed scan reports (task 1.14), each tagged with the
   * vault it was scanned against (`ScanReportEnvelope`, task 1.15 fix-
   * iteration 1) — a late report from a project the user has since switched
   * away from must be checked against the currently-open project before
   * use. Returns an unsubscribe function. */
  onScanReport(cb: (envelope: ScanReportEnvelope) => void): () => void
}
