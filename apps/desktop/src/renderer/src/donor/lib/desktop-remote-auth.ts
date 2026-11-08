/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/desktop-remote-auth.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
