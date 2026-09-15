/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/shared-gateway-restart.test.ts
 * Commit:  345cd2b057a452236de401d3534b8502a7465e8d (v2026.9.14)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { describe, expect, it } from 'vitest'

import { sharedGatewayProfiles } from './shared-gateway-restart'

describe('sharedGatewayProfiles', () => {
  it('lists every bot the shared multiplexer carries, default first, when the profile is served', () => {
    expect(sharedGatewayProfiles({ gateway_shared_with: ['beta', 'alpha', 'default'] })).toEqual([
      'default',
      'alpha',
      'beta'
    ])
  })

  it('keeps the plain restart for standalone gateways and older backends', () => {
    // Standalone profile: the backend answers null.
    expect(sharedGatewayProfiles({ gateway_shared_with: null })).toBeNull()
    // Older backend: the key does not exist at all.
    expect(sharedGatewayProfiles({})).toBeNull()
    expect(sharedGatewayProfiles(null)).toBeNull()
    // A multiplexer carrying nobody else restarts only itself: no "all bots" copy.
    expect(sharedGatewayProfiles({ gateway_shared_with: ['default'] })).toBeNull()
  })
})
