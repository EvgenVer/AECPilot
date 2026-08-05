/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/desktop-remote-auth.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { DesktopAuthProvider } from '@/global'

export interface RemoteAuthProviderShape {
  isPassword: boolean
  providerLabel: string
}

function providerDisplayName(provider: DesktopAuthProvider): string {
  return provider.displayName || provider.name
}

export function deriveRemoteAuthProviderShape(
  providers: DesktopAuthProvider[] | null | undefined,
  fallback = 'your identity provider'
): RemoteAuthProviderShape {
  const list = providers ?? []

  if (list.length === 0) {
    return { isPassword: false, providerLabel: fallback }
  }

  return {
    isPassword: list.every(provider => Boolean(provider.supportsPassword)),
    providerLabel: list.map(providerDisplayName).join(' / ')
  }
}
