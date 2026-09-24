/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/avatar.test.tsx
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the blob-face block — the shape itself is dropped in
 *       `avatar.tsx` (HX1); nothing is left for it to assert
 * (no other edits)
 */
/**
 * The avatar face: blobatar shape strings, the markup they render to, and the
 * catchlight polarity fix.
 *
 * Shape strings are stored per bot and must round-trip forever —
 * `blobatar[:seed[:kind]]`, where an unlocked seed follows the bot's name and
 * an unknown silhouette is ignored rather than trusted. The silhouette is
 * pinned by handing the library a TRAIT position inside its frozen band, so
 * the band a kind lands in is a stored-appearance contract, not an
 * implementation detail.
 *
 * Catchlight (image14 report, Aug 2026): the sparkle's contrast follows the
 * PUPIL, not the body. Dark bodies flip the pupils to light cream, and a white
 * catchlight on a cream pupil is invisible — maroon/ink/oxblood avatars looked
 * like they had "no dots in their eyes".
 */

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { blobatarSvgMock } = vi.hoisted(() => ({ blobatarSvgMock: vi.fn() }))

vi.mock('@hermes/plugin-sdk', async () => {
  const { atom } = await import('nanostores')

  return {
    atom,
    blobatarSvg: (seed: string, opts: unknown) => blobatarSvgMock(seed, opts) as string,
    createBudgetedLoop: undefined,
    host: { state: { connectionId: { get: () => 'local' } } },
    profileColor: (name: string) => (name === 'inbox-triage' ? '#38bdf8' : '#8b5cf6'),
    PROFILE_SWATCHES: ['#38bdf8', '#8b5cf6'],
    queryClient: undefined,
    useQuery: vi.fn(),
    useValue: vi.fn()
  }
})

vi.mock('./shared', () => ({ getPluginCtx: () => null, ID: 'hermes-bots' }))

/** The library's frozen band per silhouette (gen2 thresholds). */
const BANDS: Record<string, [number, number]> = {
  boxy: [0.48, 0.6],
  capsule: [0.6, 0.7],
  cloud: [0.79, 0.86],
  droplet: [0.86, 0.915],
  hexagon: [0.915, 0.95],
  nub: [0.7, 0.79],
  organic: [0.22, 0.48],
  round: [0, 0.22],
  sun: [0.95, 0.98],
  triangle: [0.98, 1]
}

interface BlobOptions {
  size: number
  traits?: { shape: number }
}

const lastBlobCall = () => blobatarSvgMock.mock.calls.at(-1) as [string, BlobOptions]

beforeEach(() => {
  vi.clearAllMocks()
  blobatarSvgMock.mockReturnValue('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>')
})

describe('blob shape strings round-trip through parse/build', () => {
  it('recognizes only the blobatar family', async () => {
    const { isBlobShape } = await import('./avatar')

    expect(isBlobShape('blobatar')).toBe(true)
    expect(isBlobShape('blobatar:seed123')).toBe(true)
    expect(isBlobShape('blobatar::sun')).toBe(true)
    expect(isBlobShape('circle')).toBe(false)
    expect(isBlobShape(undefined)).toBe(false)
  })

  it('parses the seed/silhouette segments, ignoring an unknown silhouette', async () => {
    const { parseBlobShape } = await import('./avatar')

    // Unlocked: the seed follows the name.
    expect(parseBlobShape('blobatar', 'inbox-triage')).toEqual({ kind: '', seed: 'inbox-triage', seedPart: '' })
    expect(parseBlobShape('blobatar:abc123', 'inbox-triage')).toEqual({
      kind: '',
      seed: 'abc123',
      seedPart: 'abc123'
    })
    expect(parseBlobShape('blobatar::cloud', 'inbox-triage')).toEqual({
      kind: 'cloud',
      seed: 'inbox-triage',
      seedPart: ''
    })
    expect(parseBlobShape('blobatar:abc:mystery', 'x').kind).toBe('')
  })

  it('rebuilds every segment combination', async () => {
    const { blobShapeString } = await import('./avatar')

    expect(blobShapeString('', '')).toBe('blobatar')
    expect(blobShapeString('abc', '')).toBe('blobatar:abc')
    expect(blobShapeString('abc', 'sun')).toBe('blobatar:abc:sun')
    expect(blobShapeString('', 'sun')).toBe('blobatar::sun')
  })
})

// EDIT [3]: блок про blob-лицо снят вместе с самим лицом — форма 'blob'
// убрана из выбора в `avatar.tsx` (HX1, пакет `blobatar` не установлен).
// Тест снятой поверхности держать красным нечестно, а чинить нечего:
// проверять он может только то, чего у нас нет.

// Last: re-mocking the SDK re-links the whole avatar graph, so anything after
// this would be running against the swapped module.
describe('an SDK that predates blobatarSvg', () => {
  it('renders the legacy deterministic shape instead of nothing', async () => {
    vi.resetModules()
    vi.doMock('@hermes/plugin-sdk', async () => {
      const { atom } = await import('nanostores')

      return {
        atom,
        blobatarSvg: undefined,
        createBudgetedLoop: undefined,
        host: { state: { connectionId: { get: () => 'local' } } },
        profileColor: () => '#8b5cf6',
        PROFILE_SWATCHES: [],
        queryClient: undefined,
        useQuery: vi.fn(),
        useValue: vi.fn()
      }
    })

    const { BotFace, defaultShapeFor } = await import('./avatar')
    const { container } = render(<BotFace color="#38bdf8" name="agent" shape="blobatar" size={32} />)

    expect(container.querySelector('svg[data-hb-math]')?.getAttribute('data-hb-shape')).toBe(defaultShapeFor('agent'))
  })
})
