/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/gateway/hooks/use-default-profile-preference.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect } from 'react'

import { refreshDefaultProfile, subscribeDefaultProfile } from '@/store/default-profile'

export function useDefaultProfilePreference(): void {
  useEffect(() => {
    const unsubscribe = subscribeDefaultProfile()
    // A failed read leaves the last known preference intact. It must never
    // prevent gateway boot, and the next boot/menu refresh can retry it.
    void refreshDefaultProfile().catch(() => undefined)

    return unsubscribe
  }, [])
}
