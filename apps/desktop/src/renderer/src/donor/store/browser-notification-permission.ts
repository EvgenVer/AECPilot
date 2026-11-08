/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/browser-notification-permission.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * The Webapp's browser notification permission as one store, so every control
 * that can ask (the Allow button, Send test notification) and every row that
 * shows the answer agree. The user can also change it in the browser's site
 * settings, so a view refreshes it when it opens.
 */

import { atom } from 'nanostores'

import {
  browserNotificationPermission,
  type BrowserNotificationPermission,
  requestBrowserNotificationPermission
} from '@/lib/browser-notifications'

export const $browserNotificationPermission = atom<BrowserNotificationPermission>(browserNotificationPermission())

export function refreshBrowserNotificationPermission(): void {
  $browserNotificationPermission.set(browserNotificationPermission())
}

/** Call from a click handler only. */
export async function askBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  const permission = await requestBrowserNotificationPermission()

  $browserNotificationPermission.set(permission)

  return permission
}
