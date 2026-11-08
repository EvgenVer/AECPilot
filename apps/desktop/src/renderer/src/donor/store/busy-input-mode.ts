/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/busy-input-mode.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

export type BusyInputMode = 'interrupt' | 'queue' | 'steer'

export function normalizeBusyInputMode(value: unknown): BusyInputMode {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : ''

  return mode === 'steer' || mode === 'queue' ? mode : 'interrupt'
}

export function busyInputOwnerKey(connectionId?: string | null, profile?: string | null): string {
  return JSON.stringify([connectionId ?? '', profile?.trim() || 'default'])
}

// A backend config snapshot, never a persisted Desktop-only preference.
export const $busyInputConfig = atom<{ owner: string; connection: unknown; mode: BusyInputMode } | null>(null)
