import { describe, expect, it, vi } from 'vitest'

import { createHermesDesktopBridge } from './hermes-desktop-shim'

// `getConnection` is the member the donor's multi-profile socket pool asks
// before opening a "secondary" client, so what it answers decides whether that
// pool is a real pool or a set of aliases for main's one connection. The header
// of `gateway-bridge.ts` explains why aliases are safe here; these tests pin the
// half of that explanation which lives in code, because a comment about the
// shim's behavior has already gone stale once (`voice-playback.ts`, task 3.7a,
// where reading the descriptor as "a socket can be opened to this" turned a
// graceful fallback into a throw).

describe('hermes-desktop shim: getConnection', () => {
  it('answers with a descriptor for every profile, secondaries included', async () => {
    const bridge = createHermesDesktopBridge()

    const primary = await bridge.getConnection()
    const secondary = await bridge.getConnection('другой-профиль')

    expect(primary).not.toBeNull()
    expect(secondary).not.toBeNull()
  })

  it('answers the same connection for any profile — the pool cannot fan out', async () => {
    const bridge = createHermesDesktopBridge()

    const primary = await bridge.getConnection('default')
    const secondary = await bridge.getConnection('второй')

    // Everything that names the transport is identical; only the echoed
    // `profile` field differs, and nothing opens a socket from it.
    expect(secondary.baseUrl).toBe(primary.baseUrl)
    expect(secondary.wsUrl).toBe(primary.wsUrl)
    expect(secondary.profile).toBe('второй')
  })

  it('carries no credential (SPEC C9: the token never reaches the renderer)', async () => {
    const bridge = createHermesDesktopBridge()

    const conn = await bridge.getConnection('любой')

    expect(conn.token).toBe('')
  })
})

// `readWindowBelow` is the HX12 refusal (task 3.25). Two things are pinned, and
// the second is the one that rots quietly: that it RESOLVES (a rejection here
// makes their handler answer with an empty text, and the core turns an empty
// text into "window enumeration is unavailable on this system" — a system
// limitation we do not have), and that the answer carries a readable sentence
// rather than an empty object.
//
// The double cast is not laziness. Their `global.d.ts` declares this member
// NARROWER than their own tool schema: the declared return has a required
// `platform` and no `error` at all, while `tools/read_window_tool.py` documents
// `{error, platform}` as the answer for "cannot enumerate windows" and tells the
// agent to relay it instead of retrying. We answer the shape their TOOL
// documents, because that is the shape that reaches the agent — their handler
// only stringifies the result and never reads a field of it.

describe('hermes-desktop shim: readWindowBelow (SPEC HX12)', () => {
  const refusal = async (): Promise<{ error?: string; platform?: string }> =>
    (await createHermesDesktopBridge().readWindowBelow!()) as unknown as {
      error?: string
      platform?: string
    }

  it('resolves instead of rejecting, so the tool never waits out its timeout', async () => {
    await expect(createHermesDesktopBridge().readWindowBelow!()).resolves.toBeTruthy()
  })

  it('answers a refusal the agent can relay, not an empty result', async () => {
    const answer = await refusal()

    expect(typeof answer.error).toBe('string')
    expect(answer.error!.length).toBeGreaterThan(40)
  })

  it('does not blame the operating system for a product decision', async () => {
    const answer = await refusal()

    // `platform` absent on purpose: the refusal is identical on every OS.
    expect(answer.platform).toBeUndefined()
    expect(answer.error).toContain('не из-за ограничений системы')
  })
})

// Task 3.3 (SPEC HX6). The difference this pins is not cosmetic: an unbridged
// member answers with a callable proxy, and their capability probes are plain
// truthiness checks (`Boolean(desktopGit()?.review?.prList)`). A proxy passes
// them, so "no git here" read as "git is available" everywhere at once.
describe('hermes-desktop shim: git (SPEC HX6)', () => {
  it('is declared ABSENT, so their own no-bridge branches run', () => {
    expect(createHermesDesktopBridge().git).toBeUndefined()
  })

  it('fails their capability probe the way a machine without git would', () => {
    const bridge = createHermesDesktopBridge()

    // Verbatim shape from `sidebar/filter-menu.tsx` and `store/review.ts`.
    expect(Boolean(bridge.git?.review?.prList)).toBe(false)
    expect(Boolean(bridge.git?.repoStatus)).toBe(false)
  })

  it('leaves genuinely unbridged members as the named-refusal proxy', async () => {
    // The contrast: absence is a decision, and everything else still reports
    // its own name instead of quietly resolving.
    const bridge = createHermesDesktopBridge() as unknown as Record<string, () => Promise<unknown>>

    await expect(bridge.someMemberWeNeverWired()).rejects.toThrow(/not bridged/)
  })
})

// Задача 3.26 (SPEC HX14). Зум входит в объём, импорт темы VS Code — нет, и
// разница между «проброшено» и «объявлено отсутствующим» здесь ровно та же, что
// у git: непроброшенный член — это ПРОКСИ, то есть истинное значение, и их
// проверка наличия его пропускает.
describe('hermes-desktop shim: zoom и themes (SPEC HX14)', () => {
  it('зум переложен на наш IPC в их форме', async () => {
    const getZoom = vi.fn().mockResolvedValue({ level: 0, percent: 100 })
    const setZoomPercent = vi.fn().mockResolvedValue({ level: 1, percent: 120 })
    const dispose = vi.fn()
    const onZoomChanged = vi.fn().mockReturnValue(dispose)
    ;(globalThis as unknown as { window: unknown }).window = {
      aecpilot: { getZoom, setZoomPercent, onZoomChanged }
    }

    const zoom = createHermesDesktopBridge().zoom!

    await expect(zoom.get()).resolves.toEqual({ level: 0, percent: 100 })
    zoom.setPercent(120)
    expect(setZoomPercent).toHaveBeenCalledWith(120)

    const callback = vi.fn()
    expect(zoom.onChanged(callback)).toBe(dispose)
    expect(onZoomChanged).toHaveBeenCalledWith(callback)
  })

  it('импорт темы VS Code объявлен отсутствующим (HX14)', () => {
    const bridge = createHermesDesktopBridge()

    expect(bridge.themes).toBeUndefined()
    // Их собственная ветка отказа: `if (!api?.fetchMarketplace)`.
    expect(Boolean(bridge.themes?.fetchMarketplace)).toBe(false)
  })
})
