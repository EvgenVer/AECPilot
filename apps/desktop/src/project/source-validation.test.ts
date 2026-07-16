// Unit tests for task 1.7's pure source-add validation (contract:
// specs/workspace-sources.md § Edge cases).

import { describe, expect, it } from 'vitest'
import { validateNewSource } from './source-validation'

const VAULT = 'C:\\projects\\object-x'

describe('validateNewSource — unsupported prefixes and control characters (fix-iteration 1)', () => {
  it('rejects a \\\\?\\ device/extended-length prefix', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: '\\\\?\\C:\\Tasks\\Object-X'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('не поддерживаются')
  })

  it('rejects a \\\\.\\ device prefix', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: '\\\\.\\C:\\Tasks\\Object-X'
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a path containing an embedded NUL / control character', () => {
    // Built via String.fromCharCode rather than a literal escape, so the
    // control character never has to live as a raw byte in this source file.
    const candidatePath = 'C:\\Tasks\\Object-X' + String.fromCharCode(0) + 'evil'

    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath
    })

    expect(result).toEqual({
      ok: false,
      errors: ['Путь содержит недопустимые управляющие символы']
    })
  })
})

describe('validateNewSource — non-absolute path', () => {
  it('rejects a relative path', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: 'relative\\path'
    })

    expect(result).toEqual({
      ok: false,
      errors: ['Путь к источнику должен быть абсолютным']
    })
  })
})

describe('validateNewSource — vault/source nesting (both directions)', () => {
  it('rejects a candidate inside the vault', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: 'C:\\projects\\object-x\\wiki'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('vault')
  })

  it('rejects the vault itself as a candidate', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: 'C:\\projects\\object-x'
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a candidate that contains the vault', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: 'C:\\projects'
    })

    expect(result.ok).toBe(false)
  })

  it('does not treat a sibling with a shared prefix as nested (component-boundary check)', () => {
    // 'C:\a\bc' must NOT be considered inside 'C:\a\b'.
    const result = validateNewSource({
      vaultPath: 'C:\\a\\b',
      existingRoots: [],
      candidatePath: 'C:\\a\\bc'
    })

    expect(result).toEqual({ ok: true, warnings: [] })
  })
})

describe('validateNewSource — exact duplicate of an existing source', () => {
  it('rejects the same path with different case, slash direction and a trailing separator', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: 'D:\\Tasks\\Object-X' }],
      candidatePath: 'd:/tasks/object-x/'
    })

    expect(result).toEqual({
      ok: false,
      errors: ['Этот путь уже подключён как источник']
    })
  })
})

describe('validateNewSource — overlap with an existing source (both directions, warning only)', () => {
  it('warns when the candidate is inside an existing source', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: 'D:\\Tasks\\Object-X' }],
      candidatePath: 'D:\\Tasks\\Object-X\\sub'
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('D:\\Tasks\\Object-X')
    }
  })

  it('warns when the candidate contains an existing source', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: 'D:\\Tasks\\Object-X\\sub' }],
      candidatePath: 'D:\\Tasks\\Object-X'
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings).toHaveLength(1)
  })
})

describe('validateNewSource — UNC paths', () => {
  it('warns on UNC nesting (\\\\server\\share vs \\\\server\\share\\sub)', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: '\\\\server\\share' }],
      candidatePath: '\\\\server\\share\\sub'
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings).toHaveLength(1)
  })

  it('does not warn on unrelated UNC shares (\\\\server\\share vs \\\\other\\share)', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: '\\\\server\\share' }],
      candidatePath: '\\\\other\\share'
    })

    expect(result).toEqual({ ok: true, warnings: [] })
  })

  it('accepts a new UNC source with no nesting/overlap', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [],
      candidatePath: '\\\\server\\tasks\\object-x'
    })

    expect(result).toEqual({ ok: true, warnings: [] })
  })
})

describe('validateNewSource — Cyrillic and spaces', () => {
  it('accepts a valid, non-overlapping path with Cyrillic characters and spaces', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: 'D:\\Задачи\\Объект Y' }],
      candidatePath: 'D:\\Задачи\\Объект X'
    })

    expect(result).toEqual({ ok: true, warnings: [] })
  })

  it('detects a Cyrillic duplicate regardless of case', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: 'D:\\Задачи\\Объект-X' }],
      candidatePath: 'd:\\задачи\\объект-x'
    })

    expect(result).toEqual({
      ok: false,
      errors: ['Этот путь уже подключён как источник']
    })
  })
})

describe('validateNewSource — no overlap at all', () => {
  it('accepts a fresh, unrelated path (no errors, no warnings)', () => {
    const result = validateNewSource({
      vaultPath: VAULT,
      existingRoots: [{ id: '1', root_path: 'D:\\Tasks\\Object-Y' }],
      candidatePath: 'D:\\Tasks\\Object-Z'
    })

    expect(result).toEqual({ ok: true, warnings: [] })
  })
})
