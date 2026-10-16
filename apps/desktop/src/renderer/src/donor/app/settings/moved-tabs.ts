/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/moved-tabs.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
  const moved = MOVED_TO_CAPABILITIES[params.get('tab') ?? '']

  if (moved === undefined) {
    return null
  }

  const row = params.get(moved.param)
  const suffix = row ? `&${moved.param}=${encodeURIComponent(row)}` : ''

  return `${CAPABILITIES_ROUTE}?tab=${moved.tab}${suffix}`
}
