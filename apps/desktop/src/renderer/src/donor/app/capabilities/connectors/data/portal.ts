/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/data/portal.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { openExternalLink } from '@/lib/external-link'

import { FALLBACK_PORTAL_URL } from '../../../settings/billing/use-billing-state'

const CONNECTORS_PATH = '/connectors'

const FALLBACK_CONNECTORS_ADMIN_URL = `${FALLBACK_PORTAL_URL}${CONNECTORS_PATH}`

const adminUrl = (base: string): string => {
  const origin = base.replace(/\/+$/, '')

  return origin ? `${origin}${CONNECTORS_PATH}` : FALLBACK_CONNECTORS_ADMIN_URL
}

export async function openConnectorsAdmin(): Promise<void> {
  let url = FALLBACK_CONNECTORS_ADMIN_URL

  try {
    const status = await window.hermesDesktop?.cloud?.status()

    if (status) {
      url = adminUrl(status.portalBaseUrl)
    }
  } catch {
    // The fallback still opens, and a portal link is not worth a notice.
  }

  openExternalLink(url)
}
