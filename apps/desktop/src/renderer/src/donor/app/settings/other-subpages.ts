/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/other-subpages.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { hostHas } from '@/lib/host-capabilities'

import type { SettingsSubpage } from './subpages'

// Gateway tasks and search rows that only native Desktop can act on; the Webapp's
// Gateways page is just its serving host (see WebappGatewaySettings).
export const nativeHostOnly = () => hostHas('gatewayManagement')

// Pages with separate tasks expose content-only subpages. Billing keeps its
// existing capability-gated bview=overview|plans flow rather than adding a
// second route parameter that could disagree with a pending financial action.
export const OTHER_SUBPAGES: Record<string, SettingsSubpage[]> = {
  gateway: [
    { id: 'connection', labelKey: 'gatewayConnection', available: nativeHostOnly },
    { id: 'devices', labelKey: 'gatewayDevices', available: nativeHostOnly },
    { id: 'managed-updates', labelKey: 'gatewayManagedUpdates', available: nativeHostOnly }
  ],
  keybinds: [
    { id: 'shortcuts', labelKey: 'keyboardShortcuts' },
    { id: 'hud-gesture', labelKey: 'hudGesture' },
    { id: 'screen-capture', labelKey: 'screenCapture' }
  ],
  notifications: [
    { id: 'alerts', labelKey: 'notificationAlerts' },
    { id: 'sounds', labelKey: 'notificationSounds' }
  ],
  sessions: [
    { id: 'archived', labelKey: 'archivedSessions' },
    { id: 'default-directory', labelKey: 'defaultDirectory' }
  ],
  vault: [
    { id: 'credentials', labelKey: 'vaultCredentials' },
    { id: 'sources', labelKey: 'vaultSources' }
  ],
  about: [
    { id: 'updates', labelKey: 'appUpdates' },
    { id: 'uninstall', labelKey: 'uninstall' }
  ]
}
