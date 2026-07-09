// LLM settings store for task 0.15: endpoint/model/key configuration applied
// to the hermes profile. Main-process only — never imported by the renderer
// or preload.
//
// SECURITY (see task brief / AGENTS.md §2):
// - The API key is encrypted with Electron `safeStorage` and persisted ONLY
//   as base64 ciphertext in this app's own settings file under
//   `app.getPath('userData')` — never in plaintext, never in the hermes
//   profile's config.yaml or .env.
// - `getDecryptedKey()` is the only place the key is decrypted, and its
//   return value must only ever be used to build a spawn `env` object for
//   the hermes serve child process (see main/index.ts) — never logged, never
//   sent over IPC.
// - `keyEnvVarStatus` reads the profile `.env` only to check whether a
//   variable NAME is assigned there (via `envVarIsDefined`, a pure
//   line-regex — see llm-settings-pure.ts); it never returns file contents.
//   We do NOT use hermes's `model.save_key` RPC, which persists keys in
//   plaintext into the profile `.env` — forbidden by the task brief.

import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { envVarIsDefined } from './llm-settings-pure'

// Confirmed from hermes_cli/auth.py's PROVIDER_REGISTRY["openai-api"]
// (pinned hermes 0.18.0): api_key_env_vars=("OPENAI_API_KEY",),
// base_url_env_var="OPENAI_BASE_URL". The dev profile's config.yaml pins
// `model.provider: "openai-api"`, so this is the one credential env var this
// app needs to manage.
export const PROVIDER_API_KEY_ENV_VAR = 'OPENAI_API_KEY'

export interface LlmSettings {
  model?: string
  baseUrl?: string
  /** Base64 of `safeStorage.encryptString(key)`. Never the plaintext key. */
  encryptedKey?: string
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'llm-settings.json')
}

/** Loads the app's LLM settings file, tolerating "file doesn't exist yet"
 * (first run) and any parse error by falling back to an empty settings
 * object rather than throwing. */
export function loadLlmSettings(): LlmSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const { model, baseUrl, encryptedKey } = parsed as Record<string, unknown>
    return {
      model: typeof model === 'string' ? model : undefined,
      baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
      encryptedKey: typeof encryptedKey === 'string' ? encryptedKey : undefined
    }
  } catch {
    return {}
  }
}

/** Persists `next` to the app's settings file via a temp-file + rename, so a
 * crash mid-write can never leave a half-written/corrupt settings file. */
export function saveLlmSettings(next: LlmSettings): void {
  const target = settingsPath()
  mkdirSync(dirname(target), { recursive: true })
  const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf-8')
  renameSync(tmpPath, target)
}

/** Whether `safeStorage` encryption is available on this machine/session.
 * Exposed to the renderer via `settings:get`'s `encryptionAvailable` flag so
 * the UI can warn that a key won't be saved. */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/** Decrypts the stored key for main-process-only use (injecting into the
 * hermes serve child process's env — see main/index.ts). Returns `undefined`
 * when there is no stored key, or when `safeStorage` encryption is
 * unavailable (in which case any previously-saved ciphertext can't be
 * trusted to decrypt correctly on this machine/session either). Never call
 * this to satisfy an IPC request — the renderer must only ever learn
 * whether a key is set (see `settings:get`'s `hasKey` boolean). */
export function getDecryptedKey(): string | undefined {
  const settings = loadLlmSettings()
  if (!settings.encryptedKey) return undefined
  if (!safeStorage.isEncryptionAvailable()) return undefined
  try {
    return safeStorage.decryptString(Buffer.from(settings.encryptedKey, 'base64'))
  } catch {
    return undefined
  }
}

/** Encrypts `key` for storage in `LlmSettings.encryptedKey`. Returns
 * `undefined` (meaning "don't store a key") when `safeStorage` encryption is
 * unavailable on this machine. */
export function encryptKey(key: string): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  return safeStorage.encryptString(key).toString('base64')
}

/** Checks whether `PROVIDER_API_KEY_ENV_VAR` is *assigned* in the hermes
 * profile's `.env` (dev override) — never reads or returns its value. hermes
 * resolves that var preferring `.env` over the spawn env
 * (`get_env_value_prefer_dotenv` in hermes_cli/config.py), so when this is
 * true, a key saved via the Settings UI will be silently ignored by the
 * backend; the UI surfaces that as a notice. Missing `.env` (no dev
 * override present) is treated the same as "not defined". */
export function keyEnvVarStatus(profileDir: string): boolean {
  try {
    const contents = readFileSync(join(profileDir, '.env'), 'utf-8')
    return envVarIsDefined(contents, PROVIDER_API_KEY_ENV_VAR)
  } catch {
    return false
  }
}
