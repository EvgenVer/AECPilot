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
