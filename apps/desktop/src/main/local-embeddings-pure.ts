// Local embedding model inside the app (task T83, UR53; owner decisions 2026-11-18:
// the app owns the process, the model lives in its own folder). The rules, with
// no I/O — the process, the download and the core calls live in
// `local-embeddings.ts`.
//
// WHAT IS WHOSE. The llama.cpp engine is the core's: its pinned build (UR39),
// installed by the core's own `/api/local-models/runtime/install` job into the
// core's package store, one copy shared with local chat models. The embedding
// model is ours: it lives in `<core home>/aec/embedding-models`, NOT in the
// core's `models/` folder — there it would show up in the chat model picker as a
// model nobody can talk to. The core's router cannot serve it anyway: its
// children run without `--embeddings`.

import { join, resolve, sep } from 'node:path'

/** The model the T83 bench chose (eval/reports/embedding-bench.md): top-5 hit
 *  0.85 on the Russian documents of `eval/`, MIT. Pinned to a revision with its
 *  SHA256, so «Скачать» always fetches the file the bench measured. */
export const RECOMMENDED_EMBEDDING = {
  id: 'bge-m3',
  repo: 'gpustack/bge-m3-GGUF',
  revision: '2d48f1737679ad900d5c26c5aad5410e9c70fdca',
  file: 'bge-m3-Q8_0.gguf',
  sizeBytes: 634_553_760,
  sha256: '950f4a8e5e19477a6d3c26d2f162233c20002c601f75e4b002e3239997821167',
  license: 'MIT'
} as const

/** The `rag.provider` value of «Локальная модель» in `aec-providers.json`. */
export const LOCAL_PROVIDER = 'local'

/** Preferred port; a busy one gives way to a free port, kept in the state file so
 *  the address written into the index server's environment stays the same. */
export const DEFAULT_LOCAL_PORT = 47821

/** The context the server is started with — what the bench ran. The chunker's
 *  ceiling (8 000 characters, ~3 000 tokens) stays inside it. */
export const LOCAL_CONTEXT_TOKENS = 8192

/** Chunks per second, measured by the T83 bench on the owner's machine (RTX 3050,
 *  bge-m3 Q8_0): 11.5 on the GPU build, 0.92 on the CPU. */
export const MEASURED_SPEED = { gpu: 11.5, cpu: 0.92 } as const

/** The bench's corpus: 13 documents of `eval/` — the example the estimate names. */
export const BENCH_CORPUS_CHUNKS = 1669

export interface LocalModel {
  /** The name the server answers to (`--alias`) and the index records. */
  id: string
  path: string
  source: 'download' | 'file'
  repo?: string
}

export interface LocalEmbeddingState {
  model?: LocalModel
  port?: number
  /** The running server, to stop a leftover after a crash. */
  pid?: number
  /** The app process that started it (technical debt 2026-11-18): a second app on
   *  the same profile uses that server instead of stopping it as a leftover. */
  owner?: number
}

export function localEmbeddingsHome(hermesHome: string): string {
  return join(hermesHome, 'aec')
}

export function localModelsDir(hermesHome: string): string {
  return join(localEmbeddingsHome(hermesHome), 'embedding-models')
}

export function localStatePath(hermesHome: string): string {
  return join(localEmbeddingsHome(hermesHome), 'local-embeddings.json')
}

export function localBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const port = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536
    ? value
    : undefined

/** The state file; a missing or broken one reads as «nothing chosen». */
export function parseLocalState(json: string | null): LocalEmbeddingState {
  let raw: unknown = null
  try {
    raw = json ? JSON.parse(json) : null
  } catch {
    raw = null
  }
  const state = record(raw)
  const model = record(state.model)
  const id = text(model.id)
  const path = text(model.path)
  const out: LocalEmbeddingState = {}
  if (id && path && isGgufPath(path)) {
    out.model = {
      id,
      path,
      source: model.source === 'file' ? 'file' : 'download',
      ...(text(model.repo) ? { repo: text(model.repo) } : {})
    }
  }
  if (port(state.port)) out.port = port(state.port)
  if (typeof state.pid === 'number' && Number.isInteger(state.pid) && state.pid > 0) {
    out.pid = state.pid
  }
  if (typeof state.owner === 'number' && Number.isInteger(state.owner) && state.owner > 0) {
    out.owner = state.owner
  }
  return out
}

/** Crashes counted for the restart rule: three within ten minutes and the server is
 *  left down with the reason in the window (technical debt 2026-11-18). */
export const CRASH_WINDOW_MS = 10 * 60_000
export const CRASH_LIMIT = 3

/** Whether a server that exited on its own is started again, given the times of its
 *  crashes so far (this one included). */
export function shouldRestart(crashes: number[], now: number): boolean {
  return crashes.filter((at) => now - at < CRASH_WINDOW_MS).length < CRASH_LIMIT
}

/** The Hugging Face model API answer (`/api/models/<repo>/revision/main?blobs=true`):
 *  the commit to pin and the SHA256 of each wanted file (its LFS object id). A file
 *  without one gets `null` — the caller refuses it rather than download unchecked. */
export function parseHfRevision(
  raw: unknown,
  paths: string[]
): { revision: string; sha256: Record<string, string | null> } | null {
  const info = record(raw)
  const revision = text(info.sha)
  if (!revision || !/^[0-9a-f]{40}$/.test(revision)) return null
  const siblings = Array.isArray(info.siblings) ? info.siblings.map(record) : []
  const sha256: Record<string, string | null> = {}
  for (const path of paths) {
    const entry = siblings.find((sibling) => sibling.rfilename === path)
    const oid = text(record(entry?.lfs).sha256)
    sha256[path] = oid && /^[0-9a-f]{64}$/.test(oid) ? oid : null
  }
  return { revision, sha256 }
}

export function isGgufPath(path: string): boolean {
  return /\.gguf$/i.test(path.trim())
}

/** `bge-m3-Q8_0.gguf` → `bge-m3-Q8_0`; the recommended file keeps its short name. */
export function modelIdForFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '')
  if (base === RECOMMENDED_EMBEDDING.file) return RECOMMENDED_EMBEDDING.id
  return base.replace(/(?:-\d{5}-of-\d{5})?\.gguf$/i, '')
}

/** A Hugging Face file address. Repo and path come from the core's search, which
 *  the renderer passes back — checked here, not trusted. */
export function hfFileUrl(repo: string, path: string, revision = 'main'): string | null {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.includes('..')) return null
  // Review T84: every segment from an allow-list — a backslash, a drive colon or a
  // control character would let the local file name step out of the models folder.
  if (!isGgufPath(path) || !path.split('/').every(isSafeSegment)) return null
  if (!/^[\w.-]+$/.test(revision)) return null
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://huggingface.co/${repo}/resolve/${revision}/${encoded}`
}

function isSafeSegment(segment: string): boolean {
  return /^[\w. -]+$/.test(segment) && segment !== '.' && segment !== '..'
}

/** Where a repo file lands: its last segment inside `dir`, or `null` when the name
 *  is not a plain file name or would resolve outside `dir`. */
export function modelFileIn(dir: string, repoPath: string): string | null {
  const name = repoPath.split('/').pop() ?? ''
  if (!isSafeSegment(name) || !isGgufPath(name)) return null
  const file = resolve(dir, name)
  return file.startsWith(resolve(dir) + sep) ? file : null
}

/** A model from another repo is named by repo and file: the index fingerprint must
 *  see a different model even when two repos ship the same file name. */
export function downloadedModelId(repo: string, repoPath: string): string {
  return `${repo}/${modelIdForFile(repoPath.split('/').pop() ?? repoPath)}`
}

/** The engine command line — what the T83 bench measured, plus the alias the
 *  index asks for and the layers on the GPU when the build has one. */
export function llamaServerArgs(input: {
  modelPath: string
  alias: string
  port: number
  gpu: boolean
}): string[] {
  const window = String(LOCAL_CONTEXT_TOKENS)
  return [
    '-m',
    input.modelPath,
    '--embeddings',
    '--alias',
    input.alias,
    '--host',
    '127.0.0.1',
    '--port',
    String(input.port),
    '-c',
    window,
    '-b',
    window,
    '-ub',
    window,
    '-np',
    '1',
    ...(input.gpu ? ['-ngl', '99'] : [])
  ]
}

/** Minutes to embed `chunks` fragments, rounded up; never «0». */
export function embedMinutes(chunks: number, gpu: boolean): number {
  const seconds = chunks / (gpu ? MEASURED_SPEED.gpu : MEASURED_SPEED.cpu)
  return Math.max(1, Math.ceil(seconds / 60))
}

/** The engine build the core picks (`binaries.select_backend`): a GPU build means
 *  the measured GPU speed. */
export function isGpuBackend(backend: string | null): boolean {
  return backend !== null && backend !== 'cpu'
}

/** Our embedding server's command line: `--embeddings` and the kept port. The core's
 *  chat router runs the same executable without either (review T84). */
export function isOurServerLine(commandLine: string, port: number): boolean {
  return (
    /(?:^|\s)--embeddings(?:\s|$)/.test(commandLine) &&
    new RegExp(`(?:^|\\s)--port\\s+"?${port}"?(?:\\s|$)`).test(commandLine)
  )
}

/** Image name of a process we may stop as a leftover — only our engine. */
export function isEngineImage(name: string): boolean {
  return /^llama-server(\.exe)?$/i.test(name.trim())
}
