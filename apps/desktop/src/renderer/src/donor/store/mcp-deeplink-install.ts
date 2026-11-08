/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/mcp-deeplink-install.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { translateNow } from '@/i18n'
import { MCP_DEEPLINK_ERROR_KEYS, type McpInstallRequest, parseMcpInstallDeepLink } from '@/lib/mcp-deeplink'

import { notify } from './notifications'

/**
 * Pending `hermes://mcp/install` request awaiting the user's explicit
 * confirmation. Set by the deep-link listener, consumed by
 * `McpInstallDeepLinkDialog`; null means no dialog. Nothing is written to
 * config until the user confirms in the dialog.
 */
export const $mcpInstallRequest = atom<McpInstallRequest | null>(null)

/** Validate a deep link's params into a pending install, or toast a rejection. */
export function requestMcpInstallFromDeepLink(params: Record<string, string | undefined>): void {
  const result = parseMcpInstallDeepLink(params)

  if (!result.ok) {
    notify({
      kind: 'error',
      title: translateNow('settings.mcp.deepLinkErrorTitle'),
      message: translateNow(`settings.mcp.${MCP_DEEPLINK_ERROR_KEYS[result.error]}`)
    })

    return
  }

  $mcpInstallRequest.set(result.request)
}
