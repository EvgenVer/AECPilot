/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/webhooks-rest.test.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
