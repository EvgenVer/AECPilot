/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/moved-tabs.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { CAPABILITIES_ROUTE } from '../routes'

// `plugins` used to redirect here too; it is a live Settings view again
// (Settings ▸ Plugins = each plugin's own settings pages).
const MOVED_TO_CAPABILITIES: Record<string, { param: string; tab: string }> = {
  mcp: { param: 'server', tab: 'connectors' }
}

export function movedSettingsTabRedirect(search: string): null | string {
  const params = new URLSearchParams(search)

  if (
    params.get('tab') === 'config:advanced' &&
    (params.get('page') === 'delegation' || params.get('field')?.startsWith('delegation.'))
  ) {
    params.set('tab', 'config:model')
    params.set('page', 'delegation')

    return `/settings?${params}`
  }

  const moved = MOVED_TO_CAPABILITIES[params.get('tab') ?? '']

  if (moved === undefined) {
    return null
  }

  const row = params.get(moved.param)
  const suffix = row ? `&${moved.param}=${encodeURIComponent(row)}` : ''

  return `${CAPABILITIES_ROUTE}?tab=${moved.tab}${suffix}`
}
