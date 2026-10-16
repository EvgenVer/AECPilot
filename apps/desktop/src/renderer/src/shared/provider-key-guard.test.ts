import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Rule R2: a provider key lives in our safeStorage and reaches the core only
// through the environment of the process we spawn. The donor does it the other
// way — `setEnvVar` writes the key into `$HERMES_HOME/.env` as plaintext, and
// `revealEnvVar` reads a stored credential back out — so two of their call
// sites carry edit [1] and three carry edit [3].
//
// This guard exists because those edits are re-applied by hand after every
// re-copy from a newer DONOR_SHA, and the failure mode is SILENT: if upstream
// moves key saving into a file we do not know about, everything still compiles
// and keys quietly start landing in a file our own agent can read. Writing this
// test is what turned up the second call site (their onboarding wizard), which
// the first pass had missed.

const DONOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'donor')

/** Files allowed to call `setEnvVar`, each with the reason it is not a
 * provider key. Anything else means a new write path arrived with an update. */
const ENV_WRITE_ALLOWED: Record<string, string> = {
  // 0.20.5 split hermes.ts into api/**; the wrapper moved to api/config.ts and
  // hermes.ts is now a re-export barrel that declares no call of its own.
  'api/config.ts': 'the wrapper itself — the call, not a use of it',
  // Task 3E.2 changed WHY these two are allowed. They were let through as "tool
  // API keys, not provider keys" — a distinction SPEC C10 does not draw: it
  // says a key typed into our interface is encrypted, full stop. So the boundary
  // moved off the call site and into main: `classifyEnvWrite` captures any
  // credential-shaped write to `/api/env` and stores it in safeStorage, letting
  // non-secrets (SEARXNG_URL, FIRECRAWL_API_URL) through to the core. These
  // files may keep calling `setEnvVar` because the call no longer decides where
  // the value lands.
  'app/settings/env-credentials.tsx': 'writes go through main’s credential capture (3E.2)',
  'app/settings/toolset-config-panel.tsx': 'writes go through main’s credential capture (3E.2)',
  // 0.21.5 (3.B6): the capabilities screen's plugin settings save a plugin's
  // declared secrets the same way — same boundary, same capture.
  'app/capabilities/plugins/plugins-tab.tsx': 'writes go through main’s credential capture (3E.2)',
  // 0.22.2 (T20.7): their plugin settings moved into Settings ▸ Plugins and took
  // the same secret write with them — same boundary, same capture.
  'app/settings/plugin-settings.tsx': 'writes go through main’s credential capture (3E.2)',
  'store/onboarding.ts': 'import kept for the non-provider branches; the key branch uses our bridge'
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.tsx?$/.test(entry.name)) yield full
  }
}

function donorFiles(): { rel: string; text: string }[] {
  return [...walk(DONOR_DIR)].map((file) => ({
    rel: path.relative(DONOR_DIR, file).split(path.sep).join('/'),
    text: readFileSync(file, 'utf8')
  }))
}

describe('provider keys stay in safeStorage (rule R2)', () => {
  it('nothing reads a stored credential back in plaintext', () => {
    const callers = donorFiles()
      .filter(({ text }) => /\brevealEnvVar\s*\(/.test(text))
      .map(({ rel }) => rel)

    expect(callers).toEqual([])
  })

  it('only known non-provider surfaces write to the core env store', () => {
    const writers = donorFiles()
      .filter(({ text }) => /\bsetEnvVar\s*[(,]/.test(text) || /\bsetEnvVar\b\s*$/m.test(text))
      .map(({ rel }) => rel)
      .filter((rel) => !(rel in ENV_WRITE_ALLOWED))

    expect(writers).toEqual([])
  })

  it('the two provider-key paths go through our bridge', () => {
    const byRel = new Map(donorFiles().map(({ rel, text }) => [rel, text]))

    for (const rel of ['app/settings/model-settings.tsx', 'store/onboarding.ts']) {
      const text = byRel.get(rel)
      expect(text, `${rel} is gone — re-check where provider keys are saved now`).toBeTruthy()
      expect(text, `${rel} must save the key through window.aecpilot`).toContain(
        'window.aecpilot.saveProviderKey'
      )
    }
  })

  it('no other file has started saving a provider key', () => {
    // `key_env` is their field name for "the env var this provider's key goes
    // into" — a file that reads it and also persists something is a candidate
    // new write path.
    const suspects = donorFiles()
      .filter(({ rel, text }) => {
        if (!/\bkey_env\b/.test(text)) return false
        if (!/\bsetEnvVar\s*\(|\bsaveHermesConfig\s*\(|\bsetModelAssignment\s*\(/.test(text)) {
          return false
        }
        return rel !== 'app/settings/model-settings.tsx'
      })
      .map(({ rel }) => rel)

    expect(suspects).toEqual([])
  })
})
