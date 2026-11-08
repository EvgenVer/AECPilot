/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/webhooks-rest.test.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deleteWebhook } from './hermes'

describe('Webhook REST parity helpers', () => {
  let api: ReturnType<typeof vi.fn>

  beforeEach(() => {
    api = vi.fn().mockResolvedValue({})
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { api }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('encodes the name when deleting a subscription', async () => {
    await deleteWebhook('my hook')

    expect(api).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE', path: '/api/webhooks/my%20hook' }))
  })

  it('routes an explicitly owned delete to that profile, not the ambient scope', async () => {
    await deleteWebhook('my hook', 'coder')

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', path: '/api/webhooks/my%20hook', profile: 'coder' })
    )
  })
})
