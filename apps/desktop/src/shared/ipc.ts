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
}
