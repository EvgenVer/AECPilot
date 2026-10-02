// Provider presets (task 3G.2, D-154, SPECIFICATION C5): which OpenAI-compatible
// address, key variable and models OUR modules (aec-rag, Mem0, images) use for
// the provider the person chose for the agent.
//
// The agent itself already follows the choice — that is the core's `model.provider`
// in the profile's config.yaml, written by the donor's provider screen. Our three
// modules used to hardcode OpenAI; they now ask this table instead. No provider is
// a default: an unknown one is refused in words, never quietly turned into OpenAI.
//
// Models here are suggestions for the form and for our modules, not a choice made
// for the person. Embedding width is not listed on purpose: it is measured with one
// call when the model changes (PLAN §«Интервью 2026-09-28»).
//
// SECURITY: only variable NAMES live here, never values.

/** The core's provider ids we have a preset for (`hermes_cli/auth.py`). */
export const PRESET_PROVIDER_IDS = ['gemini', 'openai-api', 'custom'] as const
export type PresetProviderId = (typeof PRESET_PROVIDER_IDS)[number]

export interface PresetModels {
  /** Main agent, specialists, rooms, graph extraction. */
  agent: string
  /** Auxiliary calls and the Mem0 LLM. */
  aux: string
  embedding: string
  /** `null` — this provider has no image generation through an OpenAI-compatible
   *  address (Gemini: probe 3G.1, D-156). */
  image: string | null
}

export interface ProviderPreset {
  id: PresetProviderId
  /** OpenAI-compatible address; `null` — taken from the profile (`custom`). */
  baseUrl: string | null
  /** Env var holding the key; `null` — taken from the profile (`custom`). */
  keyEnvVar: string | null
  /** `null` — the person names the models (`custom`). */
  models: PresetModels | null
}

export const PROVIDER_PRESETS: Readonly<Record<PresetProviderId, ProviderPreset>> = {
  // Models approved by the owner 2026-09-28 against the key's models.list.
  gemini: {
    id: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    keyEnvVar: 'GEMINI_API_KEY',
    models: {
      agent: 'gemini-3.8-flash',
      aux: 'gemini-3.5-flash-lite',
      embedding: 'gemini-embedding-2',
      image: null
    }
  },
  // What our modules used when OpenAI was hardcoded (rag_index.py, memory-config.mjs).
  'openai-api': {
    id: 'openai-api',
    baseUrl: 'https://api.openai.com/v1',
    keyEnvVar: 'OPENAI_API_KEY',
    models: {
      agent: 'gpt-5-mini',
      aux: 'gpt-5-mini',
      embedding: 'text-embedding-3-large',
      image: 'gpt-image-1'
    }
  },
  custom: { id: 'custom', baseUrl: null, keyEnvVar: null, models: null }
}

/** What the profile says about the chosen provider (read from config.yaml by the caller). */
export interface ProfileProvider {
  provider: string | null
  /** `model.base_url` — used by `custom`. */
  baseUrl?: string | null
  /** `key_env` of the matching `providers:` entry — used by `custom`. */
  keyEnvVar?: string | null
}

export type ResolvedProvider =
  | {
      ok: true
      id: PresetProviderId
      baseUrl: string
      keyEnvVar: string
      models: PresetModels | null
    }
  | { ok: false; reason: string }

export function isPresetProviderId(value: unknown): value is PresetProviderId {
  return typeof value === 'string' && (PRESET_PROVIDER_IDS as readonly string[]).includes(value)
}

/** The preset for the profile's provider, with `custom` completed from the profile.
 *  Refuses in words when there is nothing to go on — never falls back to OpenAI. */
export function resolveProvider(profile: ProfileProvider): ResolvedProvider {
  const raw = (profile.provider ?? '').trim()
  if (!raw) return { ok: false, reason: 'провайдер не выбран' }
  const id = raw.startsWith('custom:') ? 'custom' : raw
  if (!isPresetProviderId(id)) {
    return { ok: false, reason: `для провайдера «${raw}» нет OpenAI-совместимого адреса в таблице` }
  }
  const preset = PROVIDER_PRESETS[id]
  const baseUrl = preset.baseUrl ?? (profile.baseUrl ?? '').trim()
  const keyEnvVar = preset.keyEnvVar ?? (profile.keyEnvVar ?? '').trim()
  if (!baseUrl) return { ok: false, reason: 'у своего адреса не указан base_url' }
  if (!keyEnvVar) return { ok: false, reason: 'у своего адреса не указана переменная ключа' }
  return { ok: true, id, baseUrl, keyEnvVar, models: preset.models }
}

// --- Reading the choice out of config.yaml -------------------------------------

function unquote(raw: string): string {
  let value = raw.trim()
  if (value.startsWith('"') || value.startsWith("'")) {
    const end = value.indexOf(value[0], 1)
    return end === -1 ? value.slice(1) : value.slice(1, end)
  }
  const hash = value.indexOf(' #')
  if (hash !== -1) value = value.slice(0, hash)
  return value.trim()
}

/** Lines of a mapping block that starts at `header` (exact line match) and ends
 *  where indentation falls back to the header's own level. */
function blockLines(lines: string[], header: RegExp, indent: string): string[] {
  const start = lines.findIndex((line) => header.test(line))
  if (start === -1) return []
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (!line.startsWith(indent + ' ')) break
    out.push(line)
  }
  return out
}

function scalar(block: string[], indent: string, key: string): string | null {
  const re = new RegExp(`^${indent}${key}:\\s*(.*)$`)
  for (const line of block) {
    const m = re.exec(line)
    if (m) return unquote(m[1]) || null
  }
  return null
}

/** `model.provider`, `model.base_url` and, for `custom:<name>`, the `key_env` of
 *  that entry under `providers:` — the core's own keys (`hermes_cli/auth.py`,
 *  `runtime_provider_custom.py`). Line-based, like every other reader here. */
export function readProfileProvider(yamlText: string): ProfileProvider {
  const lines = yamlText.replace(/\r\n/g, '\n').split('\n')
  const model = blockLines(lines, /^model:\s*(#.*)?$/, '')
  const provider = scalar(model, '  ', 'provider')
  const baseUrl = scalar(model, '  ', 'base_url')
  let keyEnvVar: string | null = null
  if (provider?.startsWith('custom:')) {
    const name = provider.slice('custom:'.length).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const providers = blockLines(lines, /^providers:\s*(#.*)?$/, '')
    const entryStart = providers.findIndex((line) =>
      new RegExp(`^  ${name}:\\s*(#.*)?$`).test(line)
    )
    if (entryStart !== -1) {
      const entry: string[] = []
      for (const line of providers.slice(entryStart + 1)) {
        if (!line.startsWith('    ')) break
        entry.push(line)
      }
      keyEnvVar = scalar(entry, '    ', 'key_env') ?? scalar(entry, '    ', 'api_key_env')
    }
  }
  return { provider, baseUrl, keyEnvVar }
}

/** Task 3G.7: the model that would embed now differs from the one that built the
 *  index — the index refuses to open and must be rebuilt. `null` when there is no
 *  index yet or nothing changed. The project's own setting wins over the provider's. */
export function pendingEmbeddingSwitch(input: {
  builtWith: string | null
  projectModel: string | null
  providerModel: string | null
}): { from: string; to: string } | null {
  const from = (input.builtWith ?? '').trim()
  const to = (input.projectModel ?? '').trim() || (input.providerModel ?? '').trim()
  if (!from || !to || from === to) return null
  return { from, to }
}

/** Task 3G.4 (D-157): what the Mem0 layer is written with — the provider's address,
 *  the NAME of its key variable (our core plugin turns it into the key in memory,
 *  `plugins/aec_secret_filter/mem0_shared.py`) and the models. */
export interface MemoryProviderSettings {
  baseUrl: string
  keyEnvVar: string
  llmModel: string
  embeddingModel: string
  embeddingDims: number
}

/** Memory embedders per preset, with the vector width. OpenAI keeps the model the
 *  memory layer has always used (`text-embedding-3-small`, 1536) so existing facts
 *  stay readable; Gemini's width was measured by probe 3G.1 (3072). */
export const MEMORY_EMBEDDERS: Readonly<Record<'gemini' | 'openai-api', { model: string; dims: number }>> =
  {
    gemini: { model: 'gemini-embedding-2', dims: 3072 },
    'openai-api': { model: 'text-embedding-3-small', dims: 1536 }
  }

/** `null` when there is no usable provider or its models are the person's to name
 *  (`custom`) — the memory layer then keeps what it had. */
export function memoryProviderSettings(resolved: ResolvedProvider): MemoryProviderSettings | null {
  if (!resolved.ok || !resolved.models || resolved.id === 'custom') return null
  const embedder = MEMORY_EMBEDDERS[resolved.id]
  return {
    baseUrl: resolved.baseUrl,
    keyEnvVar: resolved.keyEnvVar,
    llmModel: resolved.models.aux,
    embeddingModel: embedder.model,
    embeddingDims: embedder.dims
  }
}

/** Environment for `aec-rag` (task 3G.3): names and addresses only, never a key.
 *  Empty when there is no usable provider — the server then says so per call. */
export function ragProviderEnv(resolved: ResolvedProvider): Record<string, string> {
  if (!resolved.ok) return {}
  const env: Record<string, string> = {
    AEC_RAG_BASE_URL: resolved.baseUrl,
    AEC_RAG_KEY_ENV: resolved.keyEnvVar
  }
  if (resolved.models) {
    env.AEC_RAG_EMBEDDING_MODEL = resolved.models.embedding
    // Graph extraction runs on the agent's model (owner, 2026-09-28).
    env.AEC_RAG_EXTRACTION_MODEL = resolved.models.agent
  }
  return env
}

// --- Own providers for RAG and memory (task 3G.46, D-172, SPEC C5) ---------------
//
// By default both follow the agent, as before. An agent on a subscription (the
// core's OAuth providers, e.g. `openai-codex`) has no address with a key our
// modules could use, so the person names one here: `aec-providers.json` in the
// profile, next to `mem0.json`. Memory follows RAG unless it is given its own.
// Only variable NAMES are stored, never values (C10).

export interface RagChoice {
  provider: 'agent' | PresetProviderId
  /** `custom` only. */
  baseUrl?: string
  keyEnvVar?: string
  /** Empty — the preset's model. */
  embedding?: string
  extraction?: string
}

export interface MemoryChoice {
  provider: 'rag' | 'agent' | PresetProviderId
  baseUrl?: string
  keyEnvVar?: string
  llm?: string
  embedding?: string
  /** Measured once when a non-preset embedder is chosen (task 3G.52). */
  embeddingDims?: number
}

export interface DataProviders {
  rag: RagChoice
  memory: MemoryChoice
}

export const DEFAULT_DATA_PROVIDERS: DataProviders = {
  rag: { provider: 'agent' },
  memory: { provider: 'rag' }
}

const SETTINGS_PLACE = 'окне «Индекс и память» (палитра команд, Ctrl+K)'

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function withoutEmpty<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/** The person's choice from `aec-providers.json`. A missing or broken file, or an
 *  unknown provider, reads as the default — the modules then behave as before. */
export function parseDataProviders(json: string | null): DataProviders {
  let raw: unknown = null
  try {
    raw = json ? JSON.parse(json) : null
  } catch {
    raw = null
  }
  const rag = record(record(raw).rag)
  const memory = record(record(raw).memory)
  const ragProviderId =
    rag.provider === 'agent' || isPresetProviderId(rag.provider) ? rag.provider : 'agent'
  const memoryProviderId =
    memory.provider === 'rag' || memory.provider === 'agent' || isPresetProviderId(memory.provider)
      ? memory.provider
      : 'rag'
  const dims = memory.embedding_dims
  return {
    rag: withoutEmpty({
      provider: ragProviderId,
      baseUrl: text(rag.base_url),
      keyEnvVar: text(rag.key_env),
      embedding: text(rag.embedding),
      extraction: text(rag.extraction)
    }),
    memory: withoutEmpty({
      provider: memoryProviderId,
      baseUrl: text(memory.base_url),
      keyEnvVar: text(memory.key_env),
      llm: text(memory.llm),
      embedding: text(memory.embedding),
      embeddingDims:
        typeof dims === 'number' && Number.isFinite(dims) && dims > 0 ? dims : undefined
    })
  }
}

/** The agent's provider, with the refusal saying where to choose instead when the
 *  agent works through something our modules cannot call (a subscription). */
function resolveAgentProvider(agent: ProfileProvider): ResolvedProvider {
  const resolved = resolveProvider(agent)
  if (resolved.ok) return resolved
  const raw = (agent.provider ?? '').trim()
  if (raw && !raw.startsWith('custom:') && !isPresetProviderId(raw)) {
    return {
      ok: false,
      reason: `агент работает через «${raw}» — у этого входа нет адреса с ключом для индекса и памяти; выберите провайдера в ${SETTINGS_PLACE}`
    }
  }
  return resolved
}

function resolveChoice(
  agent: ProfileProvider,
  choice: { provider: 'agent' | PresetProviderId; baseUrl?: string; keyEnvVar?: string }
): ResolvedProvider {
  if (choice.provider === 'agent') return resolveAgentProvider(agent)
  return resolveProvider({
    provider: choice.provider,
    baseUrl: choice.baseUrl,
    keyEnvVar: choice.keyEnvVar
  })
}

export type RagResolution =
  { ok: true; env: Record<string, string> } | { ok: false; reason: string }

/** Environment for `aec-rag` from the RAG choice: names and addresses only. */
export function ragProvider(agent: ProfileProvider, choices: DataProviders): RagResolution {
  const choice = choices.rag
  const resolved = resolveChoice(agent, choice)
  if (!resolved.ok) return resolved
  const embedding = choice.embedding ?? resolved.models?.embedding
  // Graph extraction runs on the agent's model of the preset (owner, 2026-09-28).
  const extraction = choice.extraction ?? resolved.models?.agent
  if (!embedding || !extraction) {
    return {
      ok: false,
      reason: `у своего адреса не выбраны модели RAG — укажите их в ${SETTINGS_PLACE}`
    }
  }
  return {
    ok: true,
    env: {
      AEC_RAG_BASE_URL: resolved.baseUrl,
      AEC_RAG_KEY_ENV: resolved.keyEnvVar,
      AEC_RAG_EMBEDDING_MODEL: embedding,
      AEC_RAG_EXTRACTION_MODEL: extraction
    }
  }
}

export type MemoryResolution =
  { ok: true; settings: MemoryProviderSettings } | { ok: false; reason: string }

/** What the Mem0 layer is written with: its own provider, or RAG's by default. */
export function memoryProvider(agent: ProfileProvider, choices: DataProviders): MemoryResolution {
  const choice = choices.memory
  const source = choice.provider === 'rag' ? choices.rag : { ...choice, provider: choice.provider }
  const resolved = resolveChoice(agent, source)
  if (!resolved.ok) return resolved
  const preset = resolved.id === 'custom' ? null : MEMORY_EMBEDDERS[resolved.id]
  const llmModel = choice.llm ?? resolved.models?.aux
  const embeddingModel = choice.embedding ?? preset?.model
  const embeddingDims =
    choice.embeddingDims ?? (preset && embeddingModel === preset.model ? preset.dims : undefined)
  if (!llmModel || !embeddingModel) {
    return {
      ok: false,
      reason: `у своего адреса не выбраны модели памяти — укажите их в ${SETTINGS_PLACE}`
    }
  }
  if (!embeddingDims) {
    return {
      ok: false,
      reason: `ширина вектора модели «${embeddingModel}» не измерена — выберите модель заново в ${SETTINGS_PLACE}`
    }
  }
  return {
    ok: true,
    settings: {
      baseUrl: resolved.baseUrl,
      keyEnvVar: resolved.keyEnvVar,
      llmModel,
      embeddingModel,
      embeddingDims
    }
  }
}

/** The choice in the file's own shape (task 3G.47) — what the window sends and
 *  what `aec-providers.json` holds. Empty fields are left out. */
export function serializeDataProviders(choices: DataProviders): {
  rag: Record<string, string>
  memory: Record<string, string | number>
} {
  const { rag, memory } = choices
  return {
    rag: withoutEmpty({
      provider: rag.provider,
      base_url: rag.baseUrl,
      key_env: rag.keyEnvVar,
      embedding: rag.embedding,
      extraction: rag.extraction
    }) as Record<string, string>,
    memory: withoutEmpty({
      provider: memory.provider,
      base_url: memory.baseUrl,
      key_env: memory.keyEnvVar,
      llm: memory.llm,
      embedding: memory.embedding,
      embedding_dims: memory.embeddingDims
    }) as Record<string, string | number>
  }
}

/** Key variables the person's own choice needs (task 3G.47): «as the agent» and
 *  «as RAG» add none — the agent's key is the agent screen's business. */
export function dataKeyEnvVars(choices: DataProviders): string[] {
  const names: string[] = []
  for (const choice of [choices.rag, choices.memory]) {
    if (choice.provider === 'agent' || choice.provider === 'rag') continue
    const name =
      choice.provider === 'custom' ? choice.keyEnvVar : PROVIDER_PRESETS[choice.provider].keyEnvVar
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}
