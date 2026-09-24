/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/mcp/install-catalog-entry.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { getActionStatus, installMcpCatalogEntry, type McpCatalogEntry, type ProfileScope } from '@/hermes'
import { translateNow } from '@/i18n'

const INSTALL_POLL_MS = 1500

const INSTALL_DEADLINE_MS = 10 * 60_000

export async function installBundledEntry(
  entry: McpCatalogEntry,
  env: Record<string, string>,
  profile?: ProfileScope
): Promise<void> {
  const result = await installMcpCatalogEntry(entry.name, env, profile ?? undefined)

  if (!result.background || !result.action) {
    return
  }

  const deadline = Date.now() + INSTALL_DEADLINE_MS

  while (Date.now() < deadline) {
    const status = await getActionStatus(result.action, 1, profile ?? undefined)

    if (!status.running) {
      if (status.exit_code !== 0) {
        throw new Error(translateNow('settings.mcp.catalogInstallFailed', entry.name))
      }

      return
    }

    await new Promise(resolve => setTimeout(resolve, INSTALL_POLL_MS))
  }

  throw new Error(translateNow('settings.mcp.catalogInstallTimeout', entry.name))
}
