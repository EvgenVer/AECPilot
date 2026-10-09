// Renderer-facing IPC surface exposed by the preload script (task 0.11). The
// renderer never sees the gateway URL/token or the raw `ipcRenderer` — only
// these methods, contextBridge-exposed as `window.aecpilot`.

import type {
  AgentProcessEntry,
  CommandDispatchResult,
  CommandsCatalogResult,
  ConfigSetResult,
  ConfigShowSection,
  ContextBreakdownResult,
  GatewayConnectionState,
  GatewayEvent,
  GatewayServerRequest,
  GatewayServerResponse,
  HistoryMessage,
  LiveSessionId,
  LiveSessionSummary,
  ModelOptionsResult,
  PluginRow,
  ProcessEntry,
  ProcessKillResult,
  PromptSubmitResult,
  RollbackCheckpoint,
  RollbackDiffResult,
  RollbackRestoreResult,
  RuntimeCheckResult,
  SessionSummary,
  SessionUsageResult,
  SlashCompletionItem,
  StoredSessionId,
  ToolsConfigureResult,
  ToolsetInfo
} from './gateway/types'

/** One profile as this app shows it (task 1.6.B5.23) — mirrors what
 * `main/profiles-pure.ts` parses out of `GET /api/profiles`, declared here for
 * the same reason as `ProjectSource` above: the renderer must not import a
 * main-only module. Their row carries fourteen fields (MEASURED by
 * `runtime/profiles-probe.mjs`); the rest describe their distribution channel
 * and shell wrappers, neither of which exists here. */
export interface ProfileRow {
  name: string
  path: string
  isDefault: boolean
  model?: string
  provider?: string
  description?: string
  skillCount?: number
}

/** What a manual compression achieved (task 1.6.B5.13).
 *
 * `messages` is NOT `session.compress`'s own `messages` field — that one is the
 * agent's raw history and would render as empty bubbles (see
 * `SessionCompressResult`). Main re-reads `session.history` after a successful
 * compress and returns that instead, so the renderer gets the same shape a
 * session switch gives it. */
export interface CompressOutcome {
  status: string
  beforeMessages: number
  afterMessages: number
  beforeTokens: number
  afterTokens: number
  messages: HistoryMessage[]
}

/** What happened to one file the user tried to attach (task 1.6.A4). A
 * refusal is a normal outcome here — no poppler for a PDF, an unsupported
 * type — so it is a value, not an exception. */
export type AttachmentOutcome =
  { ok: true; path?: string; count: number } | { ok: false; error: string }

/** Чем кончилось «сохранить наружу» (задача 3.27). Отказ и отмена — значения,
 * а не исключения, по той же причине, что у `AttachmentOutcome`: и то и другое
 * здесь нормальный ход событий. Отмена — `saved: false` БЕЗ `error`: про
 * закрытый диалог человеку не сообщают. */
/** Один файл инструкций проекта, каким его видит человек перед решением
 * (задача 3.8а). `tools` пуст — значит скил себя НЕ ограничивает, и тот, кто
 * это показывает, обязан сказать именно так. */
export interface ProjectSkillEntry {
  rel: string
  name: string
  description: string
  tools: string[]
  hash: string
}

export interface ProjectSkillsView {
  state: 'changed' | 'none' | 'trusted' | 'untrusted'
  skills: ProjectSkillEntry[]
  difference?: { added: string[]; changed: string[]; removed: string[] }
  /** Имена, перекрытые одноимённым скилом профиля: замерено, что при совпадении
   * имён побеждает профильный, и проектная инструкция в этом случае не
   * действует. Называется человеку, а не решается за него. */
  shadowed: string[]
}

/** Настройка подключения, какой её видит окно (задача 3.12). Поля с токеном
 * здесь нет физически — не «есть пустое», а нет: поле, которое нельзя забыть
 * очистить, безопаснее поля, которое надо помнить очистить. */
export interface ConnectionView {
  mode: ConnectionModeView
  remoteUrl: string
  remoteAuthMode: 'token'
  remoteTokenSet: boolean
  remoteTokenPreview: string | null
  secureTokenStorage: boolean
  remoteTokenPlainText: boolean
  envOverride: boolean
  /** Настройка ssh. Секрета здесь нет: путь к ключу — это путь, а не ключ, и
   * токен для ssh не хранится вовсе (его назначает главный процесс на каждое
   * подключение). */
  sshHost: string
  sshUser: string
  sshPort: number | null
  sshKeyPath: string
  sshRemoteHermesPath: string
  sshRemoteProfile: string
}

/** Облако (`cloud`) исключено — SPEC HX3. */
export type ConnectionModeView = 'local' | 'remote' | 'ssh'

export interface ConnectionInputView {
  mode: ConnectionModeView
  remoteUrl?: string
  /** Пустое поле значит «не менял», а не «стереть» — стирает `clearToken`. */
  remoteToken?: string
  allowPlainTextToken?: boolean
  clearToken?: boolean
  sshHost?: string
  sshUser?: string
  sshPort?: number | null
  sshKeyPath?: string
  sshRemoteHermesPath?: string
  sshRemoteProfile?: string
}

/** Ответ на «проверить». Для ssh это НЕ запуск ядра: проверка спрашивает, пустит
 * ли сервер и есть ли там ядро, — и потому не мешает живому подключению. */
export interface ConnectionTestResult {
  ok: boolean
  reachable?: boolean
  version?: string | null
  baseUrl?: string
  error?: string
  host?: string
  remoteHermesPath?: string
  remoteHermesVersion?: string
  remotePlatform?: string
  sshError?:
    | 'auth-failed'
    | 'hermes-not-found'
    | 'host-key-changed'
    | 'timeout'
    | 'unknown'
    | 'unreachable'
    | 'unsupported-platform'
    | 'update-required'
}

export interface ConnectionSaveResult {
  ok: boolean
  config: ConnectionView
  error?: string
  /** Код ошибки ssh, если подключение не состоялось: по нему экран показывает
   * своё объяснение с нужным действием. */
  sshError?: string
}

export interface SaveOutResult {
  saved: boolean
  canceled?: boolean
  path?: string
  error?: string
}

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
  /** Имя в приложении (3J.5); нет — имя конечной папки (`sourceDisplayName`). */
  label?: string
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

/** Один лист книги, разобранный для просмотрщика (задача 4.3). Строки — уже
 * текст: показываем то, что человек увидел бы в Excel, а не внутреннее
 * представление числа, даты или формулы. */
export interface SheetData {
  name: string
  rows: string[][]
  /** Строк на листе всего — может быть больше, чем прислано (см. `truncated`). */
  totalRows: number
  /** Лист длиннее потолка и прислан не целиком. Показывается человеку: молча
   * обрезанная ведомость выглядит как ведомость, в которой чего-то нет. */
  truncated: boolean
}

export type SheetReadResult = { ok: true; sheets: SheetData[] } | { error: string; ok: false }

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
  /** Ядро на другой машине (задача 3.13b): снимки собираются ТАМ, и обойти её
   * диск отсюда нечем. Отдельный ответ, а не `unknown`: разница между «не
   * смогли посмотреть» и «смотреть надо не здесь» — это разница между
   * растерянностью и пониманием. */
  | { kind: 'remote' }

/** `rollback.list`'s answer plus the local diagnosis above. */
export interface RollbackListing {
  enabled: boolean
  checkpoints: RollbackCheckpoint[]
  scope: CheckpointScopeInfo
}

/** One MCP server as their REST layer describes it (task 1.6.B2.8).
 *
 * `env` is dropped in main and replaced by `envNames`: their side already
 * redacts the values, but a redacted secret is still a secret's shape and this
 * screen has no use for either — it shows WHICH variables a server defines,
 * never what they hold. */
export interface McpServerSummary {
  name: string
  transport: string
  url?: string | null
  command?: string | null
  args?: string[]
  auth?: string | null
  enabled: boolean
  tools?: string[] | null
  /** Present only inside main, before it is stripped. */
  env?: Record<string, string>
  envNames?: string[]
}

/** Live connection state of one server, from `session.info.mcp_servers`
 * (`tools/mcp_tool.py`'s `get_mcp_status`). `status` is one of `connected`,
 * `disabled`, `connecting`, `failed`, `configured` — five states, and the
 * difference between `disabled` and `failed` is exactly what a user needs. */
export interface McpLiveStatus {
  name: string
  transport?: string
  tools?: number
  connected?: boolean
  disabled?: boolean
  status?: string
  error?: string
}

/** One skill as `GET /api/skills` describes it (task 1.6.B3.3). Richer than
 * the `skills.manage list` RPC, which answers with bare names by category —
 * measured, and the reason this list comes over REST (owner decision R1: REST
 * only where RPC does not reach). */
export interface SkillRow {
  name: string
  description?: string
  category?: string
  /** From their `skills.disabled` config. Shown, never written — owner
   * decision B3-2. */
  enabled?: boolean
}

/** One node of the learning graph (`GET /api/learning/graph`). `timestamp` is
 * a raw epoch number, not a formatted date — this endpoint does no date
 * formatting at all, which is exactly why it works where `learning.frames`
 * does not (see the note in shared/gateway/types.ts). */
export interface LearningNode {
  id: string
  label?: string
  kind?: string
  timestamp?: number
  category?: string
  useCount?: number
  state?: string
  createdBy?: string
  pinned?: boolean
}

/** A memory chunk as the graph carries it — `body` is the text itself, so a
 * memory node opens with no further call. */
export interface LearningMemoryCard {
  source?: string
  body?: string
}

/** A declared `related_skills` link, or a memory↔skill overlap. Both endpoints
 * are node ids (`agent/learning_graph.py:311`). Present in the payload since
 * before batch 3; typed here only in batch 7, when the map became the first
 * screen to draw them — the journey timeline never needed them. */
export interface LearningEdge {
  source: string
  target: string
}

export interface LearningCluster {
  category: string
  count: number
}

export interface LearningGraph {
  nodes: LearningNode[]
  memory: LearningMemoryCard[]
  edges?: LearningEdge[]
  clusters?: LearningCluster[]
  stats?: Record<string, unknown>
}

/** One raw row of a stored session's transcript, as
 * `GET /api/sessions/{id}/messages` hands it over — the columns of their
 * `messages` table (`hermes_state.py:812`), not the shaped `HistoryMessage`
 * the RPC history returns.
 *
 * `content` is `unknown` on purpose: their `_decode_content` returns a plain
 * string for an ordinary message and a decoded JSON structure for a multimodal
 * one. `timestamp` is epoch SECONDS. */
export interface StoredMessageRow {
  role?: string
  content?: unknown
  tool_calls?: unknown
  tool_name?: string
  timestamp?: number
}

/** `GET /api/curator`. Every field may be absent — their handler reads them
 * through `_safe_call` and falls back. */
export interface CuratorStatus {
  enabled?: boolean
  paused?: boolean
  interval_hours?: number | null
  last_run_at?: string | null
  min_idle_hours?: number | null
  stale_after_days?: number | null
  archive_after_days?: number | null
}

/** The `settings` block of `project.json` as the renderer sees it — snake_case
 * because that is what is on disk, and renaming it in transit would give the
 * same setting two names to grep for.
 *
 * Two of the four are languages, and they are NOT the same kind of value: SPEC
 * G7 counts three language levels and two of them live here. `wiki_lang` is a
 * code (`'auto'`, `'ru'`, `'en'`) that decides what language wiki pages are
 * written in. `extraction_language` is a word LightRAG puts into a prompt
 * (`'Russian'`, `'English'`) and decides what language entities are NAMED in
 * inside the graph. The third level — the language the agent talks in — is the
 * user's, not the project's, and lives in the profile's SOUL. */
export interface ProjectSettingsPayload {
  wiki_lang: string
  scan_interval_s: number
  embedding_model: string
  /** Empty means "not chosen yet": the Python side falls back to
   * `aec_rag.rag_index.EXTRACTION_LANGUAGE`. Vaults created before task 5.14
   * have no such field on disk and read back as empty. */
  extraction_language: string
}

/** What the index holds — `aec-rag status`'s answer (task 2.15), the same
 * numbers the `rag_status` MCP tool gives the agent. Read by the app directly
 * so the indicator works whether or not an agent session is live. */
export interface RagStatus {
  chunks_total: number
  files_indexed: number
  files_total: number
  graph: {
    chunks: number
    covers_whole_project: boolean
    documents: number
    documents_outside: number
  }
  graph_entries?: { added_at: string; kind: string; path: string }[]
  /** Documents inside a marked folder that the graph does not hold yet —
   * UR24's «ask before spending», with the size of the spend attached. */
  graph_pending: { chunks_estimate: number; documents: number; not_indexed: number }
  last_ingest_at: null | string
  /** Scanned PDF pages the second pass has yet to recognise (task 3H.15). */
  pages_pending?: number
  stale_count: number
}

/** One step of an ingest run, as the CLI reports it (task 2.15). `phase` names
 * the pass (task 3H.15): `text` — the text layer and every other format, `ocr` —
 * recognition of scanned pages; in it `page` of `pages` are the file's pages. */
export interface IngestProgressEvent {
  chunks: number
  /** Task 3J.7: why, as a code from `aec_rag/errors.py` — worded by the catalog. */
  code?: string
  done: number
  error: string
  page?: number
  pages?: number
  phase?: string
  rel_path: string
  source_id: string
  stage: string
  total: number
}

/** What an ingest run produced. */
export interface IngestRunReport {
  chunks: number
  errors: { code?: string; error: string; rel_path: string; source_id: string }[]
  files_failed: number
  files_ingested: number
  files_skipped: number
  files_total: number
  pages_failed?: number
  pages_recognized?: number
  removed_chunks: number
  /** Stopped on request between two files or pages (task 3H.16). */
  stopped?: boolean
}

/** One file of the run, as the Index page lists it (task 3H.19). */
export interface IngestFileRow {
  error: string
  /** Pages of the second pass done / waiting for it. */
  pagesDone: number
  pagesWaiting: number
  rel_path: string
  source_id: string
  /** `reading` — the text pass is on it (3J.9); `read` — text pass done,
   *  nothing waits; `waiting` — scanned pages wait; `recognizing` — the second
   *  pass is on it; `done` — every page is in. */
  state: 'done' | 'failed' | 'read' | 'reading' | 'recognizing' | 'skipped' | 'waiting'
}

/** Task 3J.8: a file's place in the index, as `aec-rag inventory` reports it. */
export type InventoryIndexState = 'failed' | 'indexed' | 'missing' | 'skipped' | 'stale'
export type InventoryGraphState = 'in' | 'marked' | 'none' | 'stale'

/** The last failure of a file at one stage. `code` is from `aec_rag/errors.py`
 *  and is worded by the catalog; `detail` is the library's own words. */
export interface InventoryError {
  at: string
  code: string
  detail: string
  stage: 'graph' | 'index'
}

export interface InventoryFile {
  errors: InventoryError[]
  graph: InventoryGraphState
  index: InventoryIndexState
  /** Why `skipped`: `unsupported`, `too_large`, `unreadable`. */
  reason: null | string
  rel_path: string
  /** Scanned pages of this content; `null` — the file has none. */
  scans: null | { done: number; error: null | string; failed: number; total: number }
  size: null | number
  source_id: string
}

export interface IndexInventory {
  files: InventoryFile[]
  /** `false` — the project was never scanned; not an error. */
  index_exists: boolean
  summary: {
    files: number
    graph: Record<InventoryGraphState, number>
    index: Record<InventoryIndexState, number>
    scans: { files: number; pages_done: number; pages_failed: number; pages_total: number }
    with_errors: number
  }
}

export interface IngestState {
  error: null | string
  /** Files the current (or last) run touched, in the order it reached them. */
  files: IngestFileRow[]
  /** Task 3J.9: the stop had to end the run by force while this file was being
   *  read — its text layer is lost and it is read again next time. */
  interrupted: null | { rel_path: string; source_id: string }
  lastReport: IngestRunReport | null
  progress: IngestProgressEvent | null
  running: boolean
  /** «Остановить» was pressed; the run ends at the next file or page. */
  stopping: boolean
}

/** Единица выбора UR24: папка (в том числе корень источника) либо файл. */
export type GraphScopeKind = 'file' | 'folder'

/** Одна отметка «это входит в граф» — то, что лежит в `project.json`. */
export interface GraphScopeEntry {
  added_at: string
  kind: string
  path: string
}

/** Прогноз `aec-rag graph-preview` (задача 5.15): сколько будет стоить отметка,
 *  посчитанное БЕЗ записи выбора. Показывается человеку до запуска — UR24
 *  требует именно этого порядка, и отказ обязан оставить проект как был. */
export interface GraphPreview {
  /** Чего в области ещё нет. Пусто — названное уже в графе (само или папкой
   *  выше), и спрашивать не о чем. */
  adds: GraphScopeEntry[]
  chunks_estimate: number
  documents: number
  /** Область целиком, какой она стала бы: подтверждение касается всего, что в
   *  ней ждёт, а не только той папки, на которой щёлкнули. */
  entries: GraphScopeEntry[]
  /** Индекса нет вовсе — нули выше не означают «работы нет». */
  index_missing: boolean
  not_indexed: number
}

/** Итог графового прогона. `forecast` — числа, на которые согласились. */
export interface GraphRunReport {
  chunks: number
  documents_added: number
  errors: { error: string; rel_path: string; source_id: string }[]
  failed: number
  forecast: { chunks_estimate: number; documents: number; not_indexed: number }
}

/** Готовность Microsoft Graph (задача 3E.9а, UR34): что из четырёх мест уже
 *  настроено. Значения — состояния, не секреты: `hasKey` и флаги профиля, и
 *  ничего похожего на само значение переменной в обе стороны не едет. */
export interface GraphAccessState {
  encryptionAvailable: boolean
  keys: { envOverrides: boolean; envVar: string; hasKey: boolean }[]
  /** `false` — профиль прочитать не удалось (ядро на другой машине, нет файла).
   *  Тогда `readiness` ничего не значит, и окно обязано сказать это, а не
   *  показать четыре «выключено». */
  profileRead: boolean
  readiness: {
    channels: { notifications: boolean; teams: boolean }
    plugins: { channel: boolean; pipeline: boolean }
  }
}

/** Провайдеры RAG и памяти (задачи 3G.46–3G.47, D-172) в форме файла
 *  `aec-providers.json` профиля: только имена переменных ключей, без значений. */
export interface DataProvidersFile {
  rag: {
    provider: 'agent' | 'gemini' | 'openai-api' | 'custom'
    base_url?: string
    key_env?: string
    embedding?: string
    extraction?: string
  }
  memory: {
    provider: 'rag' | 'agent' | 'gemini' | 'openai-api' | 'custom'
    base_url?: string
    key_env?: string
    llm?: string
    embedding?: string
    embedding_dims?: number
  }
}

/** Что показывает окно «Индекс и память». `rag`/`memory` — итог для СОХРАНЁННОГО
 *  выбора: готово или почему нет, словами. */
export interface DataProvidersState {
  encryptionAvailable: boolean
  /** `false` — профиль не прочитан (ядро на другой машине, нет файла). */
  profileRead: boolean
  /** `model.provider` агента как есть, `null` — не выбран. */
  agentProvider: string | null
  choice: DataProvidersFile
  presets: {
    id: 'gemini' | 'openai-api'
    keyEnvVar: string
    embedding: string
    extraction: string
    memoryLlm: string
    memoryEmbedding: string
  }[]
  keys: { envOverrides: boolean; envVar: string; hasKey: boolean }[]
  rag: { ok: boolean; reason?: string }
  memory: { ok: boolean; reason?: string }
}

/** Состояние графового прогона. Отдельное от `IngestState` нарочно: уровень 1
 *  бесплатен, уровень 2 стоит вызова модели на каждый фрагмент, и один
 *  индикатор на оба скрыл бы, за что именно идут деньги. */
export interface GraphAddState {
  error: null | string
  lastReport: GraphRunReport | null
  /** Что добавляют прямо сейчас. `null` — ничего не идёт. */
  path: null | string
  progress: IngestProgressEvent | null
  running: boolean
}

/** Один факт памяти проекта (слой 2). Форма ЗАМЕРЕНА на живом хранилище
 *  (задача 5.16), а не взята из спеки: `metadata` несёт только канал. */
export interface MemoryFact {
  /** Канал, из которого факт приехал. Пусто — запись без канала. */
  channel: string
  created_at: string
  id: string
  text: string
}

/** Ответ на чтение списка фактов. `busy` — отдельно от всякого другого отказа:
 *  «папку держит другой процесс» означает, что ядро ещё живо, и человеку надо
 *  сказать именно это, а не показывать чужую английскую строку про Qdrant. */
export type MemoryFactsAnswer =
  { facts: MemoryFact[]; ok: true; userId: string } | { busy: boolean; error: string; ok: false }

/** Вердикт по одной выдержке (SPEC UR26): сама фраза, её место в тексте ответа
 * и была ли она найдена в источнике. `start`/`end` нужны интерфейсу — пометка
 * ставится на конкретный кусок, а одинаковых фраз в ответе может быть две.
 * Объявлено здесь по той же причине, что `ProjectSource` выше: рендерер не
 * импортирует модули главного процесса. */
export interface QuoteVerdict {
  text: string
  start: number
  end: number
  ok: boolean
  reason: string
}

export type QuoteCheckResult =
  { available: true; quotes: QuoteVerdict[] } | { available: false; reason: string; quotes: [] }

/**
 * Итог одного вызова JSON-RPC через нашу границу IPC (находка D-37).
 *
 * ПОЧЕМУ ОТКАЗ ЕДЕТ ДАННЫМИ, А НЕ ИСКЛЮЧЕНИЕМ. `ipcRenderer.invoke` доносит из
 * главного процесса только ТЕКСТ ошибки — `code` и `data` теряются по дороге. А
 * код донора на них смотрит: `use-prompt-actions` отличает «сообщение, к
 * которому откатываются, съела компакция» по `code === 4018` и читает
 * `data.segment_ordinal`. Пока отказ ехал исключением, эта проверка была ЛОЖНА
 * ВСЕГДА, и человек видел общий текст вместо точного.
 *
 * Развёртывает это обратно в исключение `gateway-bridge.ts` — единственный, кто
 * зовёт `gatewayRpc`. Тип-объединение здесь для того, чтобы будущий второй
 * вызывающий получил ошибку КОМПИЛЯЦИИ, а не молча принял объект-итог за
 * значение: молчаливая неправда в этом проекте уже стоила дороже громкой.
 */
export type GatewayRpcOutcome<T> =
  { ok: true; value: T } | { ok: false; error: { message: string; code?: number; data?: unknown } }

export interface AecpilotApi {
  /** Whether to show the Welcome/"choose a project" screen instead of the
   * workspace shell (task 1.0). Read once from `process.env.AEC_SHOW_WELCOME`
   * at preload time — there is no project system yet (Phase 1.3/1.4), so
   * this is a dev-only flag to preview the Welcome screen; the normal
   * autostart-into-shell flow (and e2e) is unaffected when it's unset. */
  showWelcome: boolean
  /** Submits a prompt to the (lazily created) chat session. Resolves once the
   * gateway has accepted it; rejects on failure.
   *
   * Since hermes 0.19.0 (task 1.6.B5.26) acceptance has three shapes and only
   * one of them means "streaming now": `queued` (runs as the next turn) and
   * `steered` (folded into the running turn) are ALSO successes. The composer
   * shows which one happened instead of keeping a queue of its own.
   *
   * `truncateBeforeUserOrdinal` (task 1.6.B5.27) re-runs from an edited user
   * message: it counts USER messages only, and the gateway rejects an
   * out-of-range value with 4018 rather than truncating to something else. */
  submitPrompt(text: string, truncateBeforeUserOrdinal?: number): Promise<PromptSubmitResult>
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
  /** Sends one JSON-RPC request to the gateway and resolves with its result
   * (task 1.8.5). The generic door the donor's client adapter rides on — see
   * `renderer/src/shared/gateway-bridge.ts` for who calls it and
   * `main/gateway-passthrough-pure.ts` for what it refuses to forward.
   *
   * Prefer the purpose-built methods on this API where one exists: they carry
   * our own rules (session scoping, redaction, project binding) that a raw
   * method name does not. */
  gatewayRpc<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ): Promise<GatewayRpcOutcome<T>>
  /** One REST call against the same process as the gateway, for the routes
   * JSON-RPC does not cover (profiles, MCP CRUD, stored sessions, learning
   * graph). Same door, same rules, same caveat as `gatewayRpc`. */
  gatewayRest<T = unknown>(
    path: string,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      body?: unknown
      timeoutMs?: number
    }
  ): Promise<T>
  /** Requests the GATEWAY makes of the window (hermes 0.21.3, task 3.B5в):
   * clarify, approval, secret, sudo, a terminal/preview read, MCP-setup
   * consent, a tour step. Main forwards every one to every window — the
   * donor's handlers decide which window answers (a preview read: the one
   * whose session is on screen). `replayed` marks a request re-delivered by
   * `open_requests` after a reconnect. Returns an unsubscribe function. */
  onGatewayServerRequest(cb: (request: GatewayServerRequest) => void): () => void
  /** Answers one server→client request. `id` is the request's own string id;
   * the first answer per id reaches the gateway, a later one resolves
   * `false`. The answer to `preview.read` / `preview.act` / `tour` is marked
   * untrusted in main on its way out (R22) — the renderer sends it raw. */
  respondGatewayServerRequest(id: string, answer: GatewayServerResponse): Promise<boolean>
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
  /** Task 4D-15: saves bytes dropped/pasted into the composer and returns the
   * file's path. Serves the donor's `hermesDesktop.saveImageBuffer`. */
  saveAttachmentImage(
    bytes: Uint8Array,
    extension: string
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }>
  /** Reads back a file `saveAttachmentImage` wrote, as a data URL. Refuses
   * anything else — it is deliberately not a general file reader. */
  readAttachmentDataUrl(
    path: string
  ): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>
  /** Картинка из буфера обмена ОС (задача 3.27, их `saveClipboardImage`): их
   * композер вставляет её как вложение. Пишется туда же, куда падают
   * перетащенные картинки, — иначе `readAttachmentDataUrl` не сможет её
   * прочитать для предпросмотра. Пустой буфер — это `path: ''`, а не ошибка:
   * их вызывающая сторона показывает на него «в буфере нет картинки». */
  saveClipboardImage(): Promise<{ ok: true; path: string } | { ok: false; error: string }>
  /** Очень большая вставка текста как вложение (0.21.3, задача 3.B5в, их
   * `savePastedText`): композер кладёт её `.txt`-файлом рядом с картинками из
   * буфера — той же дисциплиной, что и они: путь выбирает не окно, а
   * главный процесс, и файл падает в каталог вложений. Слишком большая
   * вставка — отказ, и их композер оставляет текст в поле. */
  savePastedText(text: string): Promise<{ ok: true; path: string } | { ok: false; error: string }>
  /** Нативный диалог «сохранить как» (задача 3.27, их `selectSavePath`).
   * Возвращает выбранный путь или `null`, если человек закрыл диалог. Пишет по
   * этому пути тот, кто спрашивал: экспорт профиля отдаёт путь шлюзу. */
  selectSavePath(options?: {
    title?: string
    defaultPath?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string | null>
  /** Сохранить наружу картинку из ленты (задача 3.27, их `saveImageFromUrl`).
   * `source` — это `src` показанного `<img>`: `data:` сохраняется как байты,
   * локальный путь — копированием после проверки принадлежности проекту,
   * адрес в интернете отказывается (ссылки уходят в браузер). */
  saveImageOut(source: string): Promise<SaveOutResult>
  /** Сохранить наружу файл, который сделал агент (задача 3.27, их
   * `saveGatewayFile`). Путь проходит ту же двухслойную проверку, что и
   * предпросмотр артефактов. */
  saveFileOut(payload: { path: string; suggestedName?: string }): Promise<SaveOutResult>
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
  /** Название источника в приложении (3J.6, SPEC UR44): пишется только в
   *  `project.json`, папка на диске не меняется; пустое — сброс к имени папки. */
  renameSource(
    sourceId: string,
    label: string
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
  /** Keeps the machine from sleeping through a long unattended run (task
   * 3.18). The display may still go dark — that is `prevent-app-suspension`,
   * and it is what the criterion asks for. Answers with the state actually in
   * force, so a platform without a blocker cannot be mistaken for a working
   * one. Passing a non-boolean reads the stored preference without changing it. */
  /** Масштаб интерфейса (задача 3.26, SPEC HX14). Уровнем владеет главный
   * процесс: он общий для всех окон, переживает перезапуск и меняется ещё и
   * с клавиатуры (Ctrl +/-/0), поэтому рендерер его не хранит, а зеркалит.
   * Форма ответа — их контракт (`hermesDesktop.zoom`), чтобы их же экран
   * настроек работал без правок. */
  getZoom(): Promise<{ level: number; percent: number }>
  setZoomPercent(percent: number): Promise<{ level: number; percent: number }>
  /** Каждое изменение, включая клавиатурное, — чтобы цифра в настройках не
   * расходилась с экраном. Возвращает функцию отписки. */
  onZoomChanged(cb: (payload: { level: number; percent: number }) => void): () => void
  /** Отдать открытую вкладку предпросмотра настоящему браузеру человека
   * (задача 3E.26, SPEC UR22). ОСЛАБЛЕНИЕ песочницы, принятое владельцем:
   * HTML агента исполняется вне наших границ. Что осталось: адрес — только
   * страница проекта, выбранный человеком файл или то, что предпросмотр сам
   * выгрузил (`preview-external-pure.ts`); отказ приходит словами. */
  openPreviewInBrowser(
    url: string
  ): Promise<{ ok: true; exported: boolean } | { ok: false; error: string }>
  /** Живая перезагрузка предпросмотра (задача 3E.25, SPEC UR22).
   *
   * `watchPreviewFile` отвечает отказом СЛОВАМИ, когда за путём следить нельзя:
   * наблюдатель — настоящая возможность, и правило то же, что у вложений, —
   * файл внутри открытого проекта либо выбранный человеком в нашем диалоге
   * (`preview-watch-pure.ts`). `previewWatchCount` — для проверки, что снятое
   * слежение действительно снято. */
  watchPreviewFile(
    url: string
  ): Promise<{ ok: true; watch: { id: string; path: string } } | { ok: false; error: string }>
  /** Сохранить правку, сделанную в их редакторе предпросмотра (задача 3E.31,
   * замечание D-79). Правило то же, что у слежения: файл внутри открытого
   * проекта либо выбранный человеком в нашем диалоге, и он обязан уже
   * существовать — редактор сохраняет то, что открыл (`preview-write-pure.ts`).
   * Отказ приходит СЛОВАМИ: их панель показывает его человеку под кнопкой. */
  writePreviewText(
    path: string,
    content: string
  ): Promise<{ ok: true; path: string } | { ok: false; error: string }>
  /** Текст файла для их панели предпросмотра (дефект D-127): правило то же, что
   * у слежения — файл проекта либо выбранный человеком. Не больше 512 КиБ
   * начала; `truncated` — файл длиннее, `binary` — в нём нулевые байты. */
  readPreviewText(path: string): Promise<
    | {
        ok: true
        path: string
        text: string
        byteSize: number
        binary: boolean
        truncated: boolean
      }
    | { ok: false; error: string }
  >
  /** Снимок гостя предпросмотра PNG как data-URL (задача 3.B4, SPEC UR4:
   * их аннотации на предпросмотре). `rect` — CSS-пиксели viewport'а гостя,
   * `viewport` — его размер в тех же единицах; без `rect` — видимая область
   * целиком. Гость обязан принадлежать окну, которое просит
   * (`preview-capture-pure.ts`). Отказ приходит СЛОВАМИ. */
  capturePreview(payload: {
    rect?: { height: number; width: number; x: number; y: number }
    viewport?: { height: number; width: number }
    webContentsId: number
  }): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>
  /** Записка слоя 1 как текст плюс состояние автозаписи (задача 5.4).
   *
   * ТЕКСТ, А НЕ ПУТЬ: имена файлов выбирает ядро, и окно называет только
   * сторону — «записка агента» или «записка о человеке». `limits` — пределы
   * ядра: записка вклеивается в каждый ход целиком, и человек должен видеть,
   * сколько ему осталось, до того как отказ случится. */
  readMemoryNotes(): Promise<
    | {
        ok: true
        memory: string
        user: string
        limits: { memory: number; user: number }
        autowrite: boolean
      }
    | { ok: false; error: string }
  >
  writeMemoryNote(
    target: 'memory' | 'user',
    content: string
  ): Promise<{ ok: true } | { ok: false; error: string }>
  /** Выключатель автозаписи. Трогает ОБА пути пополнения — конец хода (слой 2,
   * через наш плагин) и их фоновый разбор (слой 1, ключ конфига). */
  setMemoryAutowrite(
    enabled: boolean
  ): Promise<{ ok: true; autowrite: boolean } | { ok: false; error: string }>
  /** Факт памяти проекта (слой 2), как его отдаёт хранилище — задача 5.16.
   *
   * ПОЛЕЙ РОВНО СТОЛЬКО, СКОЛЬКО ЕСТЬ. Замер формы: `metadata` несёт только
   * канал, `session` в записи не появляется вовсе. Поле, которое всегда пусто,
   * на экране выглядело бы потерянным фактом. */
  readMemoryFacts(): Promise<MemoryFactsAnswer>
  /** Удаляет один факт ИХ инструментом (`mem0_delete`) — командой живого ядра,
   * без его остановки (задача 3H.21). */
  deleteMemoryFact(id: string): Promise<{ ok: true } | { ok: false; error: string }>
  stopPreviewWatch(id: string): Promise<boolean>
  previewWatchCount(): Promise<number>
  onPreviewFileChanged(
    callback: (payload: { id: string; path: string; url: string }) => void
  ): () => void
  /** Абсолютный путь для цели предпросмотра. Разбор путей знает node, а не окно:
   * их запасной разбор на Windows приклеивает рабочую папку к `D:\файл`. */
  resolvePreviewTarget(
    target: string,
    baseDir?: string
  ): Promise<{ ok: true; absPath: string } | { ok: false; error: string }>
  /** Множитель зума этого окна (1 = 100 %), СИНХРОННО — задача 3E.24.
   *
   * Зачем отдельно от `getZoom()`: множитель нужен в момент отправки нажатия
   * агента внутрь предпросмотра, а обещание там читать нечем. Берётся у самого
   * Chromium (`webFrame.getZoomFactor()`), а не пересчитывается из процента: при
   * их расхождении правдой является то, что на экране. Их контракт объявляет
   * этого члена (`hermesDesktop.zoom.factor`) и их же путь контекстного меню
   * внутри гостя на него рассчитывает. */
  zoomFactor(): number
  setKeepAwake(on: boolean): Promise<{ enabled: boolean }>
  /** Язык, на котором агент отвечает человеку — третий уровень SPEC G7
   * (задача 5.14). Пустая строка — «не задан», и тогда в SOUL нового
   * специалиста не дописывается ничего: умолчание, поставленное молча, было
   * бы предпочтением, которого человек не выбирал. */
  getAgentLanguage(): Promise<{ language: string }>
  setAgentLanguage(language: string): Promise<{ language: string }>
  /** Кто запускает задачи по расписанию (задача 3.6а). Ядро само их не тикает
   * — тикает их планировщик, живущий в отдельном процессе. Человек решает,
   * поднимать ли его: это второй питон рядом, и кто расписаниями не
   * пользуется, платить за него не должен.
   *
   * `enabled` — выбор человека, переживает перезапуск; `running` — живёт ли
   * процесс сейчас. Они различаются намеренно: «включено, но не поднялось» —
   * это то, что человеку надо показать, а не скрыть. */
  /** Инструкции, которые проект несёт для агента (задача 3.8а, SPEC UR29).
   *
   * `state`: `none` — их в проекте нет; `untrusted` — есть, но человек их не
   * видел; `trusted` — доверены и с тех пор не менялись; `changed` — доверены,
   * но содержимое разошлось с тем, что человек видел. Последнее ведёт себя как
   * «не доверено»: агент их не видит, пока человек не посмотрит заново. */
  /** Ещё одно полноценное окно приложения (задача 3.14). Одно ядро, один
   * шлюз, несколько окон — «работать с двумя разговорами рядом» это про окна,
   * а не про второй запуск программы. */
  /** Плавающая лента поверх чужих окон (задача 3.24). Отдельное окно, потому
   * что смысл поверхности — быть НАД другой программой; панель внутри нашего
   * окна этого не умеет.
   *
   * `setIgnoreMouse` решает рендерер: он один знает, что под курсором, — окно
   * поверх всех иначе съедает щелчки по чужому содержимому под своей
   * прозрачной частью. */
  /** Табличка «микрофон слушает» (задача 3.7b). Отдельное окно поверх всех:
   * слово-активатор работает при свёрнутом главном окне, и значок внутри него
   * не виден — то есть не делает своей работы. Открытый микрофон, о котором не
   * сказано, человек не прощает. */
  /** К какому ядру подключено приложение (задача 3.12, SPEC UR20). Ядро может
   * стоять на другой машине — сервере организации, куда пускают по адресу с
   * токеном.
   *
   * ТОКЕНА ЗДЕСЬ НЕТ И НЕ БУДЕТ: в ответе только признак «задан» и четыре
   * последних знака. Он нужен главному процессу — тот открывает сокет и ставит
   * заголовок; окну он не нужен никогда. */
  getConnection(): Promise<ConnectionView>
  saveConnection(input: ConnectionInputView): Promise<ConnectionSaveResult>
  /** Сохранить И переподключиться. Отдельный глагол: сохранённая, но не
   * применённая настройка не должна молча менять то, с чем человек работает. */
  applyConnection(input: ConnectionInputView): Promise<ConnectionSaveResult>
  /** Проверить адрес и токен ДО сохранения — иначе об опечатке человек узнаёт
   * уже заменив ею рабочее подключение. */
  testConnection(input: ConnectionInputView): Promise<ConnectionTestResult>
  /** Имена машин из `~/.ssh/config` человека. Читается только config —
   * приватные ключи не открываются никогда и ни для чего. */
  sshHosts(): Promise<{ hosts: string[] }>
  sshResolveHost(alias: string): Promise<{
    hostname: string | null
    identityFile: string | null
    port: number | null
    user: string | null
  }>
  openHud(request?: { sessionId?: string | null; profile?: string | null }): Promise<{
    ok: boolean
  }>
  closeHud(): Promise<{ ok: boolean }>
  getHudState(): Promise<{ open: boolean; sessionId: null | string }>
  setHudIgnoreMouse(ignore: boolean): void
  /** Полосу взяли за композер: главный процесс снимает, где курсор
   * относительно её угла (задача 3.24, D-100). */
  beginHudMove(): void
  /** Полосу отпустили. */
  endHudMove(): void
  /** Кадр перетаскивания. Несёт только РАЗМЕР — положение главный процесс
   * считает от настоящего курсора, которого окно не видит. */
  moveHudBy(size: { width: number; height: number }): void
  setHudBounds(bounds: { x: number; y: number; width: number; height: number }): void
  /** Материал окна macOS. На других системах отвечает `ok:false`, чтобы их
   * стекло не считало, что применилось. */
  setHudVibrancy(on: boolean): Promise<{ ok: boolean }>
  setHudSession(sessionId: null | string): void
  onHudChanged(cb: (state: { open: boolean; sessionId: null | string }) => void): () => void
  openAppWindow(): Promise<{ ok: boolean; error?: string }>
  /** Занять разовую подсказку — звук конца хода, чтение ответа вслух (задача
   * 3.14). Отвечает `true` первому окну и `false` остальным: событие ядра одно,
   * и подсказка на него должна быть одна, сколько бы окон ни было открыто. */
  claimAmbientCue(key: string): Promise<boolean>
  /** Задача 3E.10 (UR37). Глагол правки для сфокусированного элемента окна.
   * Меню рисует само окно, поэтому системного меню здесь нет — есть только то,
   * что рендерер выполнить не может. */
  contextMenuEdit(command: 'copy' | 'cut' | 'paste' | 'selectAll'): Promise<void>
  /** Задача 3E.10. Скопировать картинку под ПОСЛЕДНИМ правым кликом: байты
   * отдаёт только `copyImageAt`, а координаты видел лишь главный процесс. */
  contextMenuCopyImage(): Promise<void>
  /** Задача 3E.10. Заменить слово с ошибкой или добавить его в словарь. */
  contextMenuSpellcheck(action: { kind: 'add' | 'replace'; word: string }): Promise<void>
  /** Задача 3E.10. То же «добавить в словарь», но для встроенной страницы:
   * тег `webview` не отдаёт рендереру сессию, поэтому страница называется своим
   * `webContentsId`. */
  contextMenuGuestAddWord(payload: { webContentsId: number; word: string }): Promise<void>
  /** Задача 3E.10. Слово с ошибкой и предложения замены для жеста, которым
   * открыли меню. Приходит вскоре ПОСЛЕ события окна: Chromium сообщает их
   * своим событием, и меню дополняется уже открытым. */
  onContextMenuSpellcheck(
    cb: (facts: { misspelledWord: string; suggestions: string[] }) => void
  ): () => void
  /** Задача 3E.11 (UR35). «В каких чатах прямо сейчас идёт ход» — из окна в
   * главный процесс, чтобы выход посреди хода спрашивал, а не убивал молча.
   * Односторонний `send`: ответ окну не нужен, а сводка шлётся на каждую смену
   * состава. */
  setActiveWork(payload: { count: number; titles: string[] }): void
  /** Задача 3E.11 (UR35). Гасить ли F12. Настройка живёт у человека и
   * переживает перезапуск; главный процесс — единственная сторона, которая
   * может перехватить клавишу до Chromium. */
  setDisableF12(blocked: boolean): void
  /** Задача 3G.23 (D-146). F12 назначен командой в этом окне — нажатие уходит
   * окну раньше Chromium (их `f12-shortcut`). */
  setF12ShortcutActive(active: boolean): void
  onF12Shortcut(
    cb: (input: {
      alt?: boolean
      code?: string
      control?: boolean
      key: string
      meta?: boolean
      repeat?: boolean
      shift?: boolean
    }) => void
  ): () => void
  /** Задача 3G.23 (D-146). Сворачивание и закрытие главного окна в трей;
   * настройка на этой машине, по умолчанию выключена. */
  minimizeToTray: {
    get(): Promise<{ enabled: boolean; available: boolean }>
    set(on: boolean): Promise<{ enabled: boolean; available: boolean }>
    onChanged(cb: (status: { enabled: boolean; available: boolean }) => void): () => void
  }
  /** Задача 3E.11 (UR35). Версии для экрана «о программе». `appVersion` —
   * НАША (C12), а не донорская. Поля их контракта про рассинхронизацию сборки
   * не заполняются: у нас нет их механизма обновления из исходников. */
  getVersion(): Promise<{
    appVersion: string
    electronVersion: string
    nodeVersion: string
    platform: string
    hermesRoot: string
  }>
  /** Окно, открытое НА КОНКРЕТНОЙ сессии. Второй вызов на ту же сессию
   * поднимает уже открытое окно, а не плодит копии. `watch` — окно-наблюдатель
   * за чужой идущей сессией: их рендерер поднимает её лениво, без сборки
   * агента. */
  openSessionWindow(sessionId: string, watch?: boolean): Promise<{ ok: boolean; error?: string }>
  /** Задача 3E.5 (UR31). Вкладка встроенного браузера в своём окне. Второй
   * вызов на ту же вкладку поднимает её окно. Закрытие окна приходит обратно
   * через `onBrowserPopoutClosed` — их сторона возвращает вкладку в панель. */
  openBrowserWindow(tabId: string): Promise<{ ok: boolean; error?: string }>
  onBrowserPopoutClosed(callback: (tabId: string) => void): () => void
  /** Задача 3E.5 (UR31, риск R13). Адрес предпросмотра, пригодный ЗДЕСЬ.
   * При удалённом ядре петлевой адрес переезжает на проброшенный порт;
   * во всех остальных случаях возвращается тот же адрес. */
  reachPreviewUrl(url: string): Promise<string>
  /** Задача 3E.8 (UR30, отменённый HX12). Окно ОС под нашим: приложение,
   * заголовок, границы. НИКОГДА пиксели; на macOS разрешение Screen Recording
   * не запрашивается — контракт приватности записан в самом HX12. */
  readWindowBelow(): Promise<{
    frontmost: { app: string; title: string } | null
    note?: string
    platform: string
    window: {
      app: string
      bounds: { height: number; width: number; x: number; y: number }
      id: number
      title: string
    } | null
  }>
  /** Задача 3E.8 (UR30, отменённый HX7). Живая оболочка терминала. Сессия
   * принадлежит окну и умирает вместе с ним. */
  terminal: {
    start(options?: { cols?: number; cwd?: string; rows?: number }): Promise<{
      cwd: string
      id: string
      shell: string
    }>
    write(id: string, data: string): Promise<boolean>
    resize(id: string, size: { cols: number; rows: number }): Promise<boolean>
    dispose(id: string): Promise<boolean>
    /** Рабочая папка живой оболочки; `null` на Windows — см. `terminal.ts`. */
    cwd(id: string): Promise<string | null>
    onData(id: string, callback: (chunk: string) => void): () => void
    onExit(
      id: string,
      callback: (event: { code: number | null; signal: string | null }) => void
    ): () => void
  }
  /** Задача 3E.5 (UR31). Жест «назад/вперёд/обновить», не дошедший до
   * страницы сам: боковая кнопка мыши и свайп приходят в главный процесс, а
   * не в окно. Когда фокус внутри гостя, главный процесс отвечает сам и сюда
   * ничего не шлёт. */
  onPreviewNav(callback: (command: 'back' | 'forward' | 'reload') => void): () => void
  getProjectSkills(): Promise<ProjectSkillsView>
  setProjectSkillsTrust(trusted: boolean): Promise<ProjectSkillsView>
  getCronRunner(): Promise<{ enabled: boolean; running: boolean }>
  setCronRunner(on: boolean): Promise<{ enabled: boolean; running: boolean }>
  onCronRunnerChanged(cb: (state: { enabled: boolean; running: boolean }) => void): () => void
  /** Тема рамки окна и подложки до первой отрисовки (задача 3.26, находка
   * D-42). Без ответа — `send`, а не `invoke`: их контракт объявляет этот член
   * возвращающим `void`, и промис на его месте убивал приложение (см.
   * `main/index.ts`, обработчик `theme:set-native`). */
  setNativeTheme(mode: 'dark' | 'light' | 'system'): void
  /** Журнал приложения (задача 3.29). Открыть папку с журналом — их кнопка
   * «показать логи» стоит и на аварийном экране, и на экране подключения. */
  revealLogs(): Promise<{ ok: boolean; path: string; error?: string }>
  /** Последние строки журнала: их экран восстановления после неудачного старта
   * показывает хвост, чтобы человеку было что переслать. */
  getRecentLogs(): Promise<{ path: string; lines: string[] }>
  /** Падение рендерера — в файл, который переживёт окно. Без ответа (`send`):
   * их контракт объявляет этот член `=> void`, и промис на его месте убил бы
   * приложение так же, как это сделал `setNativeTheme` (см. D-42). */
  reportRendererError(report: {
    label?: string
    boundary?: string
    message?: string
    componentStack?: string
  }): void
  /** Уведомление операционной системы (задача 3.28, их `notify`). КОГДА
   * показывать, решает рендерер — их хранилище держит переключатели по видам,
   * молчание при видимом окне и защиту от повторов. Здесь только показ:
   * `false` значит «показывать было нечего» или «система уведомления не
   * поддерживает», и это ответ, а не ошибка. */
  showNotification(payload: {
    title?: string
    body?: string
    silent?: boolean
    kind?: string
    sessionId?: string
    tag?: string
    actions?: Array<{ id: string; text: string }>
  }): Promise<boolean>
  /** Щелчок по уведомлению: окно поднято, и рендереру назван номер сессии,
   * чтобы он открыл именно её. */
  onNotificationFocusSession(cb: (sessionId: string) => void): () => void
  /** Нажата кнопка в уведомлении. Только macOS: на Windows кнопки в тосте
   * Electron не рисуются — см. `main/native-notify.ts`. */
  onNotificationAction(cb: (payload: { actionId: string; sessionId?: string }) => void): () => void
  /** Щелчок по уведомлению БЕЗ сессии — плагинному (задача 3D.9). Форма payload
   * задана их приёмником (`donor/global.d.ts`, `onNotificationActivate`), и
   * каждое поле необязательно: у уведомления может не быть ни кнопки, ни пути.
   * `activate` мы НЕ разбираем — их сторона резолвит путь заново. */
  onNotificationActivate(
    cb: (payload: { actionId?: string; activate?: string; notifyId?: string; tag?: string }) => void
  ): () => void
  /** Машина на батарее (задача 3.28). Их страховочные опросы на батарее
   * растягиваются вчетверо, чтобы ноутбук в фоне не тратил заряд на проверки. */
  getOnBattery(): Promise<boolean>
  onBatteryChanged(cb: (onBattery: boolean) => void): () => void
  /** Машина проснулась после сна. Рендерер на этом пересобирает своё
   * состояние; связь со шлюзом перепроверяет главный процесс — сокет мог
   * остаться открытым и мёртвым. */
  onPowerResume(cb: () => void): () => void
  /** Slash-command completions for what is being typed (task 1.6.8). Never
   * rejects: a disconnected gateway or a failed call comes back as an empty
   * list, because this runs on every keystroke and must not put an error over
   * the composer. */
  completeSlash(text: string): Promise<{ items: SlashCompletionItem[] }>
  /** Native path picker behind the donor's `hermesDesktop.selectPaths`
   * (task 3.17): their composer adds files and folders to the agent's context
   * with it. The dialog runs in main for the same reason `pickAttachments`
   * does — a path the renderer did not get from a human through a trusted
   * dialog is a path it must not have. Cancel comes back as an empty array,
   * not a rejection: their caller checks `paths?.length`. */
  selectPaths(options?: {
    title?: string
    defaultPath?: string
    directories?: boolean
    multiple?: boolean
    filters?: Array<{ name: string; extensions: string[] }>
  }): Promise<string[]>
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
  /** Второй рубеж сверки выдержек (SPEC UR26, задача 3.31b): каждая выдержка
   * готового ответа сверяется с текстом того места, на которое ссылается ответ.
   *
   * Не «на всякий случай»: у агента есть свой инструмент проверки, но замер
   * 3.22 показал, что он обходит его ровно там, где тот бы его не пропустил.
   * Здесь проверка от модели не зависит вовсе.
   *
   * `available: false` — проверка НЕ состоялась (нет индекса, нет скила с
   * матчером, процесс не ответил). Это не «всё хорошо»: показать выдержку как
   * подтверждённую после несостоявшейся проверки значило бы дать гарантию,
   * которой нет. Никогда не отклоняется — несостоявшаяся проверка это значение,
   * а не исключение. */
  checkQuotes(answer: string): Promise<QuoteCheckResult>
  /** What the index holds, for the indicator (task 2.15). */
  getIndexStatus(): Promise<{ ok: true; status: RagStatus } | { error: string; ok: false }>
  /** Task 3J.10: every file of the project with its index, scan and graph state. */
  getIndexInventory(): Promise<
    { inventory: IndexInventory; ok: true } | { error: string; ok: false }
  >
  /** Starts a tier-1 ingest of everything scanned but not indexed. Returns
   * immediately — progress arrives through `onIngestState`. `full` re-reads
   * every file rather than only the changed ones. */
  startIngest(
    full?: boolean,
    rebuild?: boolean,
    /** Task 3H.18: only this folder or file of a source. */
    target?: { kind: GraphScopeKind; rel: string; sourceId: string }
  ): Promise<{ error?: string; started: boolean }>
  /** Task 3H.16: stop the running ingest at the next file or page. What it
   *  finished stays; the next run continues from there. */
  cancelIngest(): Promise<{ stopping: boolean }>
  /** Задача 3G.7: провайдер сменил модель эмбеддингов, а индекс построен прежней
   *  (`null` — менять нечего). Только чтение: перестраивает `startIngest(true, true)`
   *  и только после согласия человека. */
  getEmbeddingSwitch(): Promise<{ from: string; to: string } | null>
  getIngestState(): Promise<IngestState>
  onIngestState(cb: (state: IngestState) => void): () => void
  /** Сколько работы будет, если отметить эту запись в граф (задача 5.15).
   *  Ничего не помечает и не индексирует: это вопрос, который задают ДО
   *  подтверждения, и отказ обязан оставить проект байт в байт таким же. */
  previewGraphAdd(
    sourceId: string,
    rel: string,
    kind: GraphScopeKind
  ): Promise<{ error: string; ok: false } | { ok: true; preview: GraphPreview }>
  /** Отмечает запись в граф и строит его по тому, что ждёт. Зовётся только
   *  после согласия человека — тратит деньги именно этот вызов. Возвращается
   *  сразу, ход прогона приходит через `onGraphAddState`. */
  startGraphAdd(
    sourceId: string,
    rel: string,
    kind: GraphScopeKind
  ): Promise<{ error?: string; started: boolean }>
  /** Чего не хватает доступу к Microsoft Graph (задача 3E.9а). Только чтение:
   *  учётные данные пишутся через `saveProviderKey` — наше шифрованное
   *  хранилище, — а три из четырёх мест живут в профиле ядра. */
  getGraphAccess(): Promise<GraphAccessState>
  /** Окно «Индекс и память» (задача 3G.47, D-172): выбор провайдеров RAG и памяти
   *  и готовность каждого. Только чтение; ключи пишутся через `saveProviderKey`. */
  getDataProviders(): Promise<DataProvidersState>
  /** Записывает выбор в `aec-providers.json` профиля и перерегистрирует `aec-rag`
   *  открытого проекта с новым окружением; профиль памяти переписывается тут же. */
  /** Задача 3G.52: смена модели эмбеддингов спрашивается ДО записи — без `confirmed`
   *  ответ несёт `warnings` и ничего не пишет. Ширину вектора своей модели памяти
   *  main замеряет одним вызовом перед записью. */
  saveDataProviders(
    choice: DataProvidersFile,
    confirmed: boolean
  ): Promise<{ error?: string; ok: boolean; warnings?: string[] }>
  /** Задача 3G.52: модели провайдера раздела — `GET <base_url>/models` его ключом,
   *  только чтение. Отказ словами; окно тогда оставляет поле для ввода руками. */
  listDataModels(
    choice: DataProvidersFile,
    section: 'rag' | 'memory'
  ): Promise<{ error?: string; models?: string[]; ok: boolean }>
  getGraphAddState(): Promise<GraphAddState>
  onGraphAddState(cb: (state: GraphAddState) => void): () => void
  /** Reads a document's bytes for the viewer (task 2.14). `sourceId` names a
   * connected source; omitted, the path is read from the vault. The path is
   * resolved inside that root by the main process — the renderer never builds
   * an absolute path, and a citation is agent-authored text, so `rel` is
   * treated as hostile input exactly like every other path from the renderer.
   *
   * Bytes rather than a `file://` URL: the renderer runs with
   * `contextIsolation` and no file access (SPEC C9), and a viewer that needs
   * the app to relax that would trade the whole sandbox for a convenience. */
  readDocument(
    rel: string,
    sourceId?: string
  ): Promise<
    | { bytes: ArrayBuffer; name: string; ok: true; path: string; size: number }
    | { error: string; ok: false }
  >
  /** Разбирает XLSX в таблицу строк для просмотрщика (задача 4.3). Путь
   * резолвится теми же проверками, что и в `readDocument` — цитата это текст,
   * написанный агентом, и `rel` враждебен ровно так же.
   *
   * Разбор идёт в главном процессе, а не в окне: exceljs — библиотека Node.
   * Только чтение: источники read-only (SPEC UR2, AC6). */
  readSheets(rel: string, sourceId?: string): Promise<SheetReadResult>
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
  /** Перезаписывает содержимое файла vault (задача 4.5). Только существующий
   * файл и только vault: заводить файлы умеет `createVaultFile` со своей
   * проверкой имени, а источники read-only (SPEC UR2, AC6). */
  writeVaultFile(rel: string, text: string): Promise<VaultOpResult>
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

  // --- Settings screen, batch 2 (task 1.6.B2.2) ----------------------------
  // Every call below is a settings surface: the renderer opens it deliberately,
  // so a failure is worth showing rather than swallowing, and these reject
  // instead of returning a neutral empty value (unlike the per-keystroke
  // completions above).
  //
  // None of them carries a secret VALUE in either direction. `hasKey`, a
  // `****last4` mask produced by the gateway, and the presence/absence of an
  // env var name are the whole vocabulary — see `getProviderKeys`.

  /** Reads one agent-behaviour setting (task 1.6.B2.13). The four readable
   * keys are the four this app writes; the gateway's own `full` key (which
   * would answer with the entire config.yaml, api key included) is not
   * reachable from here by construction. */
  getAgentConfig(
    key: 'reasoning' | 'fast' | 'busy' | 'prompt'
  ): Promise<{ value?: string; display?: string; prompt?: string }>
  /** Writes one agent-behaviour setting. Rejects for any key outside the four
   * above — in particular for `model`, which belongs to the composer's picker,
   * and for their TUI-only display keys (decision R6). */
  setAgentConfig(
    key: 'reasoning' | 'fast' | 'busy' | 'prompt' | 'verbose',
    value: string
  ): Promise<ConfigSetResult>
  /** The read-only "как настроено" summary (task 1.6.B2.15). The sections
   * arrive pre-rendered and pre-masked from the gateway; this app adds
   * nothing, precisely so that no unmasked config ever has to be fetched. */
  getConfigSummary(): Promise<{ sections: ConfigShowSection[] }>
  /** Toolsets with their tool names and current enabled state (task 1.6.B2.6). */
  listToolsets(): Promise<{ toolsets: ToolsetInfo[] }>
  /** Enables/disables whole toolsets (task 1.6.B2.7). The three outcome lists
   * in the result mean different things and must not be merged — see
   * `ToolsConfigureResult`. */
  configureToolsets(action: 'enable' | 'disable', names: string[]): Promise<ToolsConfigureResult>
  /** Installed plugins with activation state (task 1.6.B2a.2). */
  listPlugins(): Promise<{ plugins: PluginRow[]; userCount: number; bundledCount: number }>
  /** Turns one plugin on/off (task 1.6.B2a.3). `confirmed` is required when
   * enabling a plugin whose `source` is not `bundled`: that is third-party
   * code being switched on inside the gateway process, and main refuses the
   * call without it. `unchanged: true` means it was already in that state. */
  togglePlugin(payload: {
    name: string
    enable: boolean
    confirmed?: boolean
  }): Promise<{ ok: boolean; unchanged: boolean; plugin: PluginRow | null }>
  /** Background processes (task 1.6.B2a.4): `own` are this session's, killable;
   * `others` come from `agents.list` and are observation-only — the gateway
   * refuses a cross-session kill (4044) and this app offers no button for it
   * (decision R8). */
  listProcesses(): Promise<{ own: ProcessEntry[]; others: AgentProcessEntry[] }>
  /** Stops one background process of the current session (task 1.6.B2a.5).
   * `confirmed` is checked in main. `status` distinguishes `killed` /
   * `already_exited` / `not_found`, all of which resolve rather than reject. */
  killProcess(payload: { processId: string; confirmed: true }): Promise<ProcessKillResult>
  /** "Would a prompt sent right now reach a model?" (task 1.6.B2.4). Never
   * rejects on a provider problem — that is the answer, not an error. */
  checkRuntime(): Promise<RuntimeCheckResult>
  /** Which credential env vars have a key stored (task 1.6.B2.5, owner
   * decision R2 — our encrypted store, never their plaintext `.env`).
   *
   * `envVars` are the candidates the catalogue named (`key_env` per provider);
   * anything already holding a key is returned too, so a key can always be
   * deleted even after its provider leaves the catalogue. The answer carries
   * NO key value and no mask of one: `hasKey` is the entire vocabulary.
   * `envOverrides` warns that the dev profile's `.env` assigns the same
   * variable, which hermes prefers over the spawn env. */
  getProviderKeys(envVars: string[]): Promise<{
    encryptionAvailable: boolean
    keys: { envVar: string; hasKey: boolean; envOverrides: boolean }[]
  }>
  // --- Skills and learning, batch 3 (contract: specs/agent-skills.md) -----

  /** Installed skills with description, category and enabled state (task
   * 1.6.B3.3). Over REST because the RPC answers with bare names. */
  listSkills(): Promise<SkillRow[]>
  /** Re-scans the skill directories (task 1.6.B3.4). Returns what changed —
   * added/removed names and the new total. */
  reloadSkills(): Promise<{ added: string[]; removed: string[]; total: number }>
  /** Turns one skill on or off (task 1.6.B3.17). Writes their own
   * `skills.disabled` through `PUT /api/skills/toggle` — not by editing
   * config.yaml, which rule R3 forbids and which the earlier decision assumed
   * was the only option. Takes effect for the next session the agent builds. */
  toggleSkill(payload: { name: string; enabled: boolean }): Promise<unknown>
  /** The content of one journey node (task 1.6.B3.5): a skill's SKILL.md or a
   * memory chunk. `ok: false` arrives as a resolved value, not a rejection —
   * their mutations module answers that way for a missing id. */
  getLearningNode(id: string): Promise<{
    ok: boolean
    message?: string
    kind?: string
    label?: string
    content?: string
  }>
  /** Rewrites a node's content (task 1.6.B3.6). `confirmed` is checked in
   * main, so the screen's confirmation step cannot be skipped. */
  editLearningNode(payload: {
    id: string
    content: string
    confirmed: true
  }): Promise<{ ok: boolean; message?: string }>
  /** Archives a skill or deletes a memory chunk (task 1.6.B3.7) — the two have
   * different consequences and the caller is expected to have said which in
   * its confirmation. `confirmed` is checked in main. */
  deleteLearningNode(payload: {
    id: string
    confirmed: true
  }): Promise<{ ok: boolean; message?: string }>
  /** The learning graph (task 1.6.B3.10). Over REST because the RPC that was
   * meant for this (`learning.frames`) raises on Windows — see the note in
   * shared/gateway/types.ts. */
  getLearningGraph(): Promise<LearningGraph>
  /** Curator state (task 1.6.B3.9). Over REST because `command.dispatch
   * {name:'curator'}` answers 4018 — measured. */
  getCuratorStatus(): Promise<CuratorStatus>
  /** `/learn <тема>` from the UI (task 1.6.B3.13). Returns their dispatch
   * result verbatim: `{type:'send', message}` is a prompt to submit as a
   * normal turn, anything else is not sent anywhere. */
  dispatchLearn(topic: string): Promise<{ type?: string; message?: string; output?: string }>

  /** The open project's own settings (tasks 1.6.B2.17–B2.19, extended by
   * 5.14): wiki language, scan interval, embedding model, extraction language.
   * They live in `project.json` because they belong to the vault and travel
   * with it. `null` when no project is open. */
  getProjectSettings(): Promise<ProjectSettingsPayload | null>
  /** Updates any subset of them. Changing the interval also restarts the scan
   * scheduler, so the new value is not left sitting in the file while the old
   * one keeps firing.
   *
   * Changing `extractionLanguage` has a consequence this call does NOT carry
   * out and cannot hide: the graph must be re-ingested whole. `check_compatible`
   * refuses to open a graph built in another language, and that refusal is the
   * protection against one entity ending up with two names. Any screen offering
   * this field has to say so BEFORE the write, not after (finding D-38). */
  updateProjectSettings(patch: {
    wikiLang?: string
    scanIntervalS?: number
    embeddingModel?: string
    extractionLanguage?: string
  }): Promise<{ ok: true; settings: ProjectSettingsPayload } | { ok: false; error: string }>
  /** MCP servers: their configuration (REST — there are no `mcp.*` RPC
   * methods at all) plus the live connection state last seen on
   * `session.info` (tasks 1.6.B2.8–B2.12). No `env` VALUE is ever included. */
  listMcpServers(): Promise<{ servers: McpServerSummary[]; live: McpLiveStatus[] }>
  /** Enables/disables a server and reloads the gateway's MCP layer, without
   * which the change would sit in config.yaml unnoticed by the running
   * process. */
  setMcpServerEnabled(payload: { name: string; enabled: boolean }): Promise<unknown>
  /** Adds a server. Their core validates the command/args and refuses a
   * suspicious configuration with a 400 — that refusal is a security decision
   * and is shown as such, not as a crash. */
  addMcpServer(payload: {
    name: string
    url?: string
    command?: string
    args?: string[]
    env?: Record<string, string>
  }): Promise<unknown>
  /** DESTRUCTIVE — deletes the server's configuration, env map included.
   * `confirmed` is verified in main. */
  removeMcpServer(payload: { name: string; confirmed: true }): Promise<unknown>
  /** Connects to the server, lists its tools, disconnects. Slow by nature
   * (60 s budget) — the row shows a "проверяю" state meanwhile. */
  testMcpServer(name: string): Promise<{ ok: boolean; error?: string; tools?: unknown[] }>
  /** Re-reads every MCP server. Called first WITHOUT `confirm` so the
   * gateway's own "this invalidates the prompt cache" warning reaches the
   * user; repeat with `confirm: true` after they agree. */
  reloadMcpServers(confirm?: boolean): Promise<{ status: string; message?: string }>
  // --- Sessions, details, palette, YOLO, profiles: batch 5 ------------------
  // Contract: specs/agent-sessions.md. Every call below is opened deliberately
  // by the user, so a failure is shown rather than swallowed.
  //
  // Two ids travel here and they are NOT interchangeable — see `LiveSessionId`
  // / `StoredSessionId` in shared/gateway/types.ts. The rule in this API: a
  // parameter named `storedId` addresses a database row, `liveId` addresses a
  // session this gateway process is holding open right now.

  /** Live sessions of the gateway process (task 1.6.B5.9) — a different
   * question from `listSessions`, which reads the database. `current` marks the
   * one this window is attached to. */
  listActiveSessions(): Promise<{ sessions: LiveSessionSummary[] }>
  /** Attaches to another LIVE session without closing the current one (task
   * 1.6.B5.9). */
  activateSession(liveId: LiveSessionId): Promise<{
    sessionId: LiveSessionId
    messages: HistoryMessage[]
  }>
  /** DESTRUCTIVE and irreversible — drops the row and its transcript files
   * (task 1.6.B5.4). `confirmed` is checked in main. A live session is refused
   * by the gateway with 4023, which arrives as a rejection carrying its text. */
  deleteSession(payload: { storedId: StoredSessionId; confirmed: true }): Promise<{
    deleted: string
  }>
  /** The raw transcript of a STORED session (task 1.6.B7.3). Over REST, and
   * both halves of the reason are measured: `session.history` resolves a LIVE
   * sid and answers 4001 for a stored id, and even when it does answer it has
   * already thrown the tool arguments away. See the handler in main for the
   * exact lines. Rows come through untouched — shaping them is
   * `artifact-source.ts`'s job, and the artifacts tab is the only caller. */
  getSessionMessages(storedId: StoredSessionId): Promise<{ messages: StoredMessageRow[] }>
  // --- Artifacts on disk (tasks 1.6.B7.4/B7.5) ----------------------------
  //
  // An artifact path is a string the MODEL wrote, so these three grant
  // deliberately different amounts: `stat` reads metadata, `reveal` highlights
  // the file in the OS file manager (selects — never launches), `preview`
  // reads bytes and is fenced to the open project. There is no "open with the
  // default application": `shell.openPath` on a model-authored path is an
  // arbitrary-file-open primitive, the same reason `file:` is missing from
  // `decideExternalLink`'s allow-list. A LINK artifact goes through
  // `openExternalLink`.

  /** Whether the artifact is on disk and where it sits relative to the
   * project. A missing file resolves as `{ok: true, exists: false}` — an
   * answer, not a failure: the row is marked rather than hidden. */
  statArtifact(value: string): Promise<
    | {
        ok: true
        exists: boolean
        isFile: boolean
        size: number
        insideProject: boolean
        previewable: boolean
      }
    | { ok: false; error: string }
  >
  /** Highlights the file in the OS file manager. Allowed outside the project;
   * refused when the file is gone, with an explanation. */
  revealArtifact(value: string): Promise<{ ok: true } | { ok: false; error: string }>
  /** Reads a raster image into a data-URL. Inside the project only (symlinks
   * resolved), size-capped, and `svg` is excluded on purpose — it is markup
   * with script capability. */
  previewArtifact(
    value: string
  ): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>
  /** Renames a session (task 1.6.B5.7). A session that is not currently live
   * cannot be renamed directly — main resumes it first, because their
   * `session.title` resolves a LIVE sid. `pending: true` means the name will
   * apply once the session has its first message; that is a success. */
  renameSession(payload: { storedId: StoredSessionId; title: string }): Promise<{
    title: string
    pending: boolean
  }>
  /** Forks the current session (task 1.6.B5.10). Refused by the gateway (4008)
   * when the session has no turns yet, so the caller disables the control
   * instead. The new session becomes the active one and is tagged against the
   * open project. */
  branchSession(name?: string): Promise<{ sessionId: LiveSessionId; title: string }>
  /** Token spend of the active session (task 1.6.B5.11). Missing
   * `context_used`/`context_max` means "unknown", never 0 %. */
  getSessionUsage(): Promise<SessionUsageResult>
  /** What is filling the context window (task 1.6.B5.12). Their `color` field
   * is ignored — see `ContextBreakdownCategory`. */
  getContextBreakdown(): Promise<ContextBreakdownResult>
  /** Compresses the active session's context (task 1.6.B5.13). Refused by the
   * gateway mid-turn (4009), so the caller disables the control. */
  compressSession(focusTopic?: string): Promise<CompressOutcome>
  /** Drops the last turn from the gateway's in-memory history (task
   * 1.6.B5.15). The transcript in the database keeps it — the turn comes back
   * on the next resume, and the UI says so. Refused mid-turn (4009). */
  undoTurn(): Promise<{ removed: number }>
  /** Injects a note into the RUNNING turn (task 1.6.B5.16). `rejected` is a
   * normal answer: the agent declined it. Error 4010 means this agent has no
   * steering at all. */
  steerSession(text: string): Promise<{ status: string }>
  /** The slash-command registry behind the palette (task 1.6.B5.18). */
  getCommandCatalog(): Promise<CommandsCatalogResult>
  /** Runs one command by name (task 1.6.B5.19). The five `type`s mean five
   * different things and an unknown one is reported, never guessed. */
  dispatchCommand(name: string, arg: string): Promise<CommandDispatchResult>
  /** Approval bypass for the CURRENT session only (task 1.6.B5.21/B5.22).
   * There is no way to reach their global scope from here — `setYolo` sends no
   * `scope`, so `approvals.mode` in config.yaml is never touched and the app's
   * own approvals selector stays the only owner of the persistent setting. */
  setYolo(enabled: boolean): Promise<ConfigSetResult>
  /** Profiles (task 1.6.B5.23) — the batch's one REST surface (owner decision
   * B5-1=C, allowed by rule R1: the gateway has no `profile.*` methods at all).
   *
   * `current` is what sessions are built against right now; `launched` is what
   * the gateway process itself was started with; `active` is their sticky
   * default for future CLI runs, shown but never written by this app. */
  listProfiles(): Promise<{
    profiles: ProfileRow[]
    current: string
    launched: string
    active: string
  }>
  createProfile(name: string): Promise<unknown>
  /** DESTRUCTIVE — removes the profile's directory, keys and session history
   * included. `confirmed` is checked in main, which also refuses the profile
   * the gateway runs as and `default`. */
  deleteProfile(payload: { name: string; confirmed: true }): Promise<unknown>
  /** Points new and resumed sessions at `name` (the `profile` parameter of
   * `session.create`/`session.resume`, measured accepted). Their sticky
   * `POST /api/profiles/active` is deliberately NOT called: it changes which
   * profile the user's own CLI picks up next, and by their own comment it does
   * not retarget a running process anyway. */
  useProfile(name: string): Promise<{ ok: boolean; current: string }>
  /** Stores (`key: string`) or removes (`key: null`) one provider's key and
   * restarts the backend, because a key reaches hermes through the child
   * process's environment and therefore only applies from the next start.
   * `ok: false` with a message when this machine cannot encrypt — the key is
   * NOT written in plaintext as a fallback.
   *
   * `keepConnection` (D-177): окна не видят обрыва связи на время этого
   * перезапуска — им пользуется окно первого запуска, которое иначе
   * закрывается на переподключении, не дойдя до шага выбора модели. */
  saveProviderKey(payload: {
    envVar: string
    key: string | null
    keepConnection?: boolean
  }): Promise<{ ok: boolean; restarted: boolean; error?: string }>
}
