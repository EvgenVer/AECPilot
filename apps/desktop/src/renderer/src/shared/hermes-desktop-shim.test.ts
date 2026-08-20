import { describe, expect, it } from 'vitest'

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
