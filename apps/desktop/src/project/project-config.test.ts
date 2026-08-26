// Unit tests for task 1.1's project.json schema/validator (no electron
// import — runs directly under vitest's node environment).

import { describe, expect, it } from 'vitest'
import { PROJECT_CONFIG_SCHEMA_VERSION, validateProjectConfig } from './project-config'

const VALID_CONFIG = {
  schema_version: 1,
  name: 'Объект-X',
  created_at: '2026-07-14T12:00:00.000Z',
  sources: [
    { id: 'src-1', root_path: '\\\\server\\tasks\\object-x', added_at: '2026-07-14T12:05:00.000Z' }
  ],
  settings: {
    wiki_lang: 'auto',
    scan_interval_s: 300,
    embedding_model: '',
    extraction_language: ''
  }
}

/** A vault created before task 5.14 — the settings block has no
 * `extraction_language` at all. Every project on disk today is this shape, so
 * it must keep validating. */
const PRE_5_14_CONFIG = {
  ...VALID_CONFIG,
  settings: { wiki_lang: 'auto', scan_interval_s: 300, embedding_model: '' }
}

describe('validateProjectConfig — valid input', () => {
  it('accepts a fully-populated valid config', () => {
    const result = validateProjectConfig(VALID_CONFIG)
    expect(result).toEqual({ ok: true, value: VALID_CONFIG })
  })

  it('accepts an empty sources array', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, sources: [] })
    expect(result.ok).toBe(true)
  })

  it('accepts a non-"auto" wiki_lang code', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, wiki_lang: 'ru' }
    })
    expect(result.ok).toBe(true)
  })

  // Task 5.14. `extraction_language` is the THIRD project language setting
  // (SPEC G7 counts three levels; finding D-38 found this one already built on
  // the Python side — `aec_rag.rag_index` reads it and refuses to open a graph
  // built in another language). It never existed on the TypeScript side, and
  // that is not merely a missing feature: the validator rebuilds `settings`
  // from the fields it knows, so a value set by hand was ERASED by the next
  // write through the app. These two pin both halves.
  it('keeps extraction_language instead of dropping it on the way through', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, extraction_language: 'English' }
    })
    expect(result).toEqual({
      ok: true,
      value: {
        ...VALID_CONFIG,
        settings: { ...VALID_CONFIG.settings, extraction_language: 'English' }
      }
    })
  })

  it('accepts a config with no extraction_language and reads it as "not chosen"', () => {
    // Making the field required would declare every vault created before 5.14
    // corrupt, so absent normalizes to the empty string — the same "not chosen
    // yet" the Python side already understands (`rag_index.load_settings`).
    const result = validateProjectConfig(PRE_5_14_CONFIG)
    expect(result.ok && result.value.settings.extraction_language).toBe('')
  })

  it('ignores unknown extra fields anywhere (forward-compat), not an error', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      extra_top_level: 'ignored',
      sources: [{ ...VALID_CONFIG.sources[0], extra_source_field: 'ignored' }],
      settings: { ...VALID_CONFIG.settings, extra_setting: 'ignored' }
    })
    expect(result.ok).toBe(true)
  })

  it('exposes the current schema version as a constant', () => {
    expect(PROJECT_CONFIG_SCHEMA_VERSION).toBe(1)
  })
})

describe('validateProjectConfig — top-level structural errors', () => {
  it('rejects a non-object input (string)', () => {
    const result = validateProjectConfig('not-an-object')
    expect(result).toEqual({
      ok: false,
      errors: [{ path: '', message: 'config must be an object' }]
    })
  })

  it('rejects null', () => {
    const result = validateProjectConfig(null)
    expect(result.ok).toBe(false)
  })

  it('rejects an array', () => {
    const result = validateProjectConfig([1, 2, 3])
    expect(result.ok).toBe(false)
  })
})

describe('validateProjectConfig — missing fields', () => {
  it('reports each missing top-level field', () => {
    const result = validateProjectConfig({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    const paths = result.errors.map((e) => e.path).sort()
    expect(paths).toEqual(['created_at', 'name', 'schema_version', 'settings', 'sources'])
  })

  it('reports each missing field inside a sources element', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, sources: [{}] })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const paths = result.errors.map((e) => e.path).sort()
    expect(paths).toEqual(['sources[0].added_at', 'sources[0].id', 'sources[0].root_path'])
  })

  it('reports each missing field inside settings', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, settings: {} })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const paths = result.errors.map((e) => e.path).sort()
    expect(paths).toEqual([
      'settings.embedding_model',
      'settings.scan_interval_s',
      'settings.wiki_lang'
    ])
  })
})

describe('validateProjectConfig — wrong types', () => {
  it('rejects a numeric name', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, name: 42 })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'name', message: 'name must be a non-empty string' }]
    })
  })

  it('rejects a non-string created_at', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, created_at: 12345 })
    expect(result.ok).toBe(false)
  })

  it('rejects a malformed created_at date string', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, created_at: '14-07-2026' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'created_at', message: 'created_at must be an ISO-8601 date string' }]
    })
  })

  it('rejects sources that is not an array', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, sources: 'not-an-array' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'sources', message: 'sources must be an array' }]
    })
  })

  it('rejects a settings that is not an object', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, settings: 'not-an-object' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'settings', message: 'settings must be an object' }]
    })
  })

  it('rejects a non-string embedding_model', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, embedding_model: 42 }
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'settings.embedding_model', message: 'embedding_model must be a string' }]
    })
  })
})

describe('validateProjectConfig — isIsoDateString Date.parse guard', () => {
  // These strings match the ISO_8601_RE digit-group format exactly but are
  // calendar-invalid (month 13, day 40; month 00) — Date.parse (V8) returns
  // NaN for both, confirmed via `node -e`. Removing the `!Number.isNaN(...)`
  // guard from isIsoDateString would make these pass, so they must fail
  // validation to catch that regression.
  it('rejects a created_at with an out-of-range month/day that Date.parse rejects', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, created_at: '2026-13-40T12:00:00Z' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'created_at', message: 'created_at must be an ISO-8601 date string' }]
    })
  })

  it('rejects a sources[].added_at with an out-of-range month that Date.parse rejects', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      sources: [{ ...VALID_CONFIG.sources[0], added_at: '2026-00-10T00:00:00Z' }]
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'sources[0].added_at', message: 'added_at must be an ISO-8601 date string' }]
    })
  })
})

describe('validateProjectConfig — schema_version', () => {
  it('rejects schema_version !== 1', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, schema_version: 2 })
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'schema_version',
          message: 'unsupported schema_version 2 (expected 1)'
        }
      ]
    })
  })

  it('rejects a non-numeric schema_version', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, schema_version: '1' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'schema_version', message: 'schema_version must be a number' }]
    })
  })
})

describe('validateProjectConfig — empty strings', () => {
  it('rejects an empty name', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, name: '' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'name', message: 'name must be a non-empty string' }]
    })
  })

  it('rejects a whitespace-only name', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, name: '   ' })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'name', message: 'name must be a non-empty string' }]
    })
  })

  it('rejects an empty source id', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      sources: [{ ...VALID_CONFIG.sources[0], id: '' }]
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'sources[0].id', message: 'id must be a non-empty string' }]
    })
  })

  it('rejects an empty source root_path', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      sources: [{ ...VALID_CONFIG.sources[0], root_path: '' }]
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'sources[0].root_path', message: 'root_path must be a non-empty string' }]
    })
  })

  it('rejects a whitespace-only source root_path', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      sources: [{ ...VALID_CONFIG.sources[0], root_path: '   ' }]
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'sources[0].root_path', message: 'root_path must be a non-empty string' }]
    })
  })

  it('rejects an empty wiki_lang', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, wiki_lang: '' }
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'settings.wiki_lang', message: 'wiki_lang must be a non-empty string' }]
    })
  })

  it('accepts an empty embedding_model (allowed to be blank)', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, embedding_model: '' }
    })
    expect(result.ok).toBe(true)
  })
})

describe('validateProjectConfig — scan_interval_s', () => {
  it('rejects a negative scan_interval_s', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, scan_interval_s: -60 }
    })
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          path: 'settings.scan_interval_s',
          message: 'scan_interval_s must be a finite number greater than 0'
        }
      ]
    })
  })

  it('rejects a zero scan_interval_s', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, scan_interval_s: 0 }
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-finite scan_interval_s (Infinity)', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, scan_interval_s: Infinity }
    })
    expect(result.ok).toBe(false)
  })

  it('rejects a non-numeric scan_interval_s', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      settings: { ...VALID_CONFIG.settings, scan_interval_s: '300' }
    })
    expect(result.ok).toBe(false)
  })
})

describe('validateProjectConfig — broken sources element', () => {
  it('rejects a sources element that is not an object', () => {
    const result = validateProjectConfig({ ...VALID_CONFIG, sources: ['not-an-object'] })
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'sources[0]', message: 'source must be an object' }]
    })
  })

  it('reports errors per-index across multiple broken sources elements', () => {
    const result = validateProjectConfig({
      ...VALID_CONFIG,
      sources: [{ ...VALID_CONFIG.sources[0] }, { id: '', root_path: 'ok', added_at: 'not-a-date' }]
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    const paths = result.errors.map((e) => e.path).sort()
    expect(paths).toEqual(['sources[1].added_at', 'sources[1].id'])
  })
})

describe('validateProjectConfig — collects multiple errors in one call', () => {
  it('returns every error found, not just the first', () => {
    const result = validateProjectConfig({
      schema_version: 2,
      name: '',
      created_at: 'bad-date',
      sources: [{ id: '', root_path: 'ok', added_at: 'bad-date' }],
      settings: { wiki_lang: '', scan_interval_s: -1, embedding_model: 42 }
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(1)
    const paths = result.errors.map((e) => e.path).sort()
    expect(paths).toEqual(
      [
        'created_at',
        'name',
        'schema_version',
        'settings.embedding_model',
        'settings.scan_interval_s',
        'settings.wiki_lang',
        'sources[0].added_at',
        'sources[0].id'
      ].sort()
    )
  })
})
