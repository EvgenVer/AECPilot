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
