// Renderer-facing IPC surface exposed by the preload script (task 0.11). The
// renderer never sees the gateway URL/token or the raw `ipcRenderer` — only
// these methods, contextBridge-exposed as `window.aecpilot`.

import type {
  ConfigSetResult,
  GatewayConnectionState,
  GatewayEvent,
  HistoryMessage,
  ModelOptionsResult,
  RollbackCheckpoint,
  RollbackDiffResult,
  RollbackRestoreResult,
  SessionSummary,
  SlashCompletionItem
} from './gateway/types'

/** What happened to one file the user tried to attach (task 1.6.A4). A
 * refusal is a normal outcome here — no poppler for a PDF, an unsupported
 * type — so it is a value, not an exception. */
export type AttachmentOutcome =
  { ok: true; path?: string; count: number } | { ok: false; error: string }

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

/** Result of `createProject` (tasks 1.3/1.5.4). `needsConfirm` means the
 * target directory (Obsidian-style init into a non-empty folder) already has
 * its own `AGENTS.md` and/or `.aecpilot` — re-invoke with `confirmed: true`
 * to initialize anyway, leaving every existing file/folder (including that
 * AGENTS.md/.aecpilot) untouched and only adding the missing vault structure
 * around it. */
export type CreateProjectResult =
  { ok: true; project: OpenProject } | { ok: false; error: string } | { needsConfirm: string[] }

/** Result of `openProject` (tasks 1.4/1.5.4). `needsInit` means `vaultPath`
 * has no `.aecpilot/project.json` yet — not an error, the folder just isn't
 * an AECPilot project yet (Obsidian-style: any folder can become one).
 * `suggestedName` is the folder's own name, offered as a default when
 * prompting the user to name the project before calling `createProject` on
 * the same path. */
export type OpenProjectResult =
  | { ok: true; project: OpenProject }
  | { ok: false; error: string }
  | { needsInit: true; suggestedName: string }

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
  /** Task 1.16 fix-iteration (review major): a source id found in `index.db`
   * but no longer present in `project.json` (e.g. a `removeSourceFromProject`
   * that won a race against a concurrent `aec-rag detach`, which then lost
   * its SQLite lock race and failed) — mapped to the number of its rows just
   * detached by this scan's self-healing sweep (mcp/aec_rag's `run_scan`).
   * Only present when non-empty; not surfaced by task 1.15's
   * `ScanNotification` (it's an internal recovery detail, not a user-facing
   * source change). */
  detached_orphans?: Record<string, number>
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

/** Why an empty snapshot list may not mean "the agent changed nothing" (task
 * 1.6.C2) — computed in main by replaying hermes's own working-directory
 * search over the vault root; see `main/checkpoint-scope-pure.ts`.
 * `unknown` means no project is open (or the vault root couldn't be read), so
 * nothing can be said either way. */
export type CheckpointScopeInfo =
  | { kind: 'vault' }
  | { kind: 'ancestor'; dir: string }
  | { kind: 'blocked'; dir: string }
  | { kind: 'unmarked' }
  | { kind: 'unknown' }

/** `rollback.list`'s answer plus the local diagnosis above. */
export interface RollbackListing {
  enabled: boolean
  checkpoints: RollbackCheckpoint[]
  scope: CheckpointScopeInfo
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
  /** Answers a blocking `clarify.request` (task 1.5.D1). `requestId` must be
   * the one from the event — the gateway matches by it and rejects a stale
   * id (its request may have timed out), so callers must handle rejection. */
  respondClarify(requestId: string, answer: string): Promise<{ status: string }>
  /** Answers a blocking `secret.request` (task 1.5.D1). `value` is the secret
   * itself: it exists only in transit — the renderer must clear it right
   * after this call and must never place it in chat state, the transcript or
   * a log. Passing an empty string is the documented "skip". */
  respondSecret(requestId: string, value: string): Promise<{ status: string }>
  /** Declines a blocking `sudo.request` (task 1.5.D1). Takes NO password by
   * design: this app never collects an OS password, so no caller is able to
   * send one. Unblocks the agent, which proceeds without elevation. */
  declineSudo(requestId: string): Promise<{ status: string }>
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
  /** Creates a new vault at `dirPath` named `name`, records it as the
   * most-recent project, and makes it the current open project (see
   * `onProjectOpened`). `dirPath` may be empty, non-existent, or (task
   * 1.5.4, Obsidian-style init) a non-empty directory the user already has
   * files in — only the missing vault structure is created there, existing
   * files are never touched. `confirmed` must be `true` to proceed past a
   * naming conflict (the directory already has its own `AGENTS.md`/
   * `.aecpilot`) previously returned as `needsConfirm` — call again with the
   * same `dirPath`/`name` and `confirmed: true` to initialize anyway.
   * `error` is a human-readable message suitable for display in the
   * create-project dialog. */
  createProject(dirPath: string, name: string, confirmed?: boolean): Promise<CreateProjectResult>
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
   * Re-opening the already-open project is a no-op success. A `vaultPath`
   * that exists but isn't a project yet comes back as `needsInit` (task
   * 1.5.4) instead of an error — see `OpenProjectResult`. `error` is a
   * human-readable message suitable for display next to the recents entry or
   * the open-project action. */
  openProject(vaultPath: string): Promise<OpenProjectResult>
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
  /** Disconnects `sourceId` from the current project (task 1.16,
   * specs/workspace-sources.md's "Отключение источника"): removes it from
   * `project.json` (the source of truth — always happens on success) and,
   * best-effort, tells `index.db` to mark every matching row `detached`
   * (never deleted) via a short-lived `aec-rag detach` process; a detach
   * failure does not roll back the `project.json` removal. `error` is a
   * human-readable message (unknown `sourceId`, no open project, or a
   * `project.json` write failure). */
  removeSource(
    sourceId: string
  ): Promise<{ ok: true; sources: ProjectSource[] } | { ok: false; error: string }>
  /** Reads a connected source's directory tree (task 1.8) — read-only, no
   * write operations exist for a source (RO by construction, see
   * specs/workspace-sources.md's "Гарантия read-only"). Symlinks are shown
   * as a leaf, never traversed. */
  getSourceTree(sourceId: string): Promise<SourceTreeResult>
  /** Opens the OS file manager with a connected source's entry highlighted
   * (task 1.5.5, specs/workspace-sources.md § UI-операции: "любой узел
   * ... источника, на любом уровне вложенности") — `rel` is the entry's rel
   * path from the source root (posix-style, as in `SourceTreeNode.path`);
   * `''` targets the source's own root. Read-only, never modifies the
   * source. */
  showSourceEntryInExplorer(sourceId: string, rel: string): Promise<VaultOpResult>
  /** Opens a link from the agent's answer in the OS browser (task 1.6.4a).
   * The renderer never navigates to it itself — main decides whether the URL
   * is allowed at all (`http`/`https`/`mailto` only) and returns why not, so
   * the chat can show the refusal instead of failing silently. */
  openExternalLink(url: string): Promise<VaultOpResult>
  /** Slash-command completions for what is being typed (task 1.6.8). Never
   * rejects: a disconnected gateway or a failed call comes back as an empty
   * list, because this runs on every keystroke and must not put an error over
   * the composer. */
  completeSlash(text: string): Promise<{ items: SlashCompletionItem[] }>
  /** Attachments (task 1.6.A4). The list lives in the gateway's session and is
   * folded into the next message by `prompt.submit`, so `count` from these
   * calls is the truth and the composer only mirrors it.
   *
   * A PDF becomes one attachment PER PAGE — their side renders pages to images
   * because the model pipeline takes images, not PDFs. */
  pickAttachments(): Promise<AttachmentOutcome[]>
  /** Attaches the image in the OS clipboard, if there is one. A refusal
   * ("нет картинки") comes back as `ok: false`, not as a rejection. */
  pasteAttachment(): Promise<AttachmentOutcome>
  detachAttachment(path: string): Promise<{ count: number }>
  /** Completions for an `@`-reference being typed (task 1.6.A3). Never
   * rejects, for the same reason as `completeSlash`: it runs per keystroke. */
  completePath(word: string): Promise<{ items: SlashCompletionItem[] }>
  /** Reads or controls the standing goal (task 1.6.A5). Never rejects: the
   * badge polls this, and a gateway without the goals module must not put an
   * error over the chat — it comes back as an empty `output`, which reads as
   * "no goal". Setting a goal is not here: `/goal <text>` in the composer is
   * the one way in. */
  dispatchGoal(action: 'status' | 'pause' | 'resume' | 'clear'): Promise<{ output: string }>
  /** The provider/model catalogue for the composer's picker (task 1.6.9).
   * `refresh` re-fetches every provider's live list and probes custom
   * endpoints — slow, so it is only for an explicit "обновить". */
  getModelOptions(refresh?: boolean): Promise<ModelOptionsResult>
  /** Applies one of the three picker settings (task 1.6.9). `model` and
   * `reasoning` are per-session on their side; `fast` also writes their global
   * `agent.service_tier`. Rejects during an in-flight turn (their guard), so
   * callers must surface the failure rather than assume it took. */
  setModelConfig(
    key: 'model' | 'reasoning' | 'fast',
    value: string,
    confirmExpensive?: boolean
  ): Promise<ConfigSetResult>
  /** Resolves a connected source's entry to its absolute path (task 1.5.5)
   * — backs "Копировать путь": the renderer copies the returned `path` to
   * the clipboard itself, never concatenating `rootPath`/`rel` on its own
   * (anti-traversal resolution stays a main-process concern, same as every
   * other source path resolution). */
  getSourceEntryPath(
    sourceId: string,
    rel: string
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }>
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
  /** Resolves a vault entry to its absolute path (task 1.5.7) — backs the
   * context menu's "Копировать путь" for a vault node, same contract as
   * `getSourceEntryPath`: the renderer copies the returned `path` to the
   * clipboard itself, never concatenating the vault root with `rel` on its
   * own (anti-traversal resolution stays a main-process concern). */
  getVaultEntryPath(rel: string): Promise<{ ok: true; path: string } | { ok: false; error: string }>
  /** Checkpoints and rollback (task 1.6.C2, contract
   * specs/checkpoints-rollback.md). All three address the agent session's
   * working directory — the open vault — because the gateway takes no
   * directory parameter.
   *
   * Snapshots, most recent first. `enabled: false` is "checkpoints are off",
   * which is a different thing from an empty list; `scope` explains an empty
   * list that is NOT the agent's inactivity. Rejects when the gateway is
   * unreachable — this screen is opened deliberately, so a failure is worth
   * showing rather than swallowing. */
  listCheckpoints(): Promise<RollbackListing>
  /** Diff of one snapshot against the vault's current state. Two empty
   * strings is an ambiguous answer their handler cannot disambiguate: it means
   * "no changes" OR "no such snapshot" (see `RollbackDiffResult`). */
  diffCheckpoint(hash: string): Promise<RollbackDiffResult>
  /** DESTRUCTIVE — overwrites files in the vault. `confirmed` must be `true`;
   * main rejects the call otherwise, so the screen's confirmation step cannot
   * be bypassed. `filePath` (vault-relative) restores just that one file and
   * leaves the chat history alone; omitting it is a full restore, which also
   * drops the last turn from the session history and is refused by the gateway
   * while a turn is running. A refusal from hermes arrives as a resolved
   * `{ success: false, error }`, not a rejection. */
  restoreCheckpoint(payload: {
    hash: string
    filePath?: string
    confirmed: true
  }): Promise<RollbackRestoreResult>
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
