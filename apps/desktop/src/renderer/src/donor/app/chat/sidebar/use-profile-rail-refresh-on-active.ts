/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/use-profile-rail-refresh-on-active.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect } from 'react'

import { refreshActiveProfile } from '@/store/profile'

/**
 * Re-pull the running profile + list on mount, and again whenever the window
 * regains focus/visibility -- a profile created, deleted, or renamed by
 * another surface (Manage Profiles, another window, the CLI) leaves the
 * rail's cached $profiles stale until something re-fetches it. Without this,
 * a deleted profile's square lingers in the rail until the user happens to
 * open Manage Profiles (whose own refresh() call was the only other reader).
 *
 * Cheap and best-effort, matching the focus/visibilitychange refresh pattern
 * used elsewhere in the sidebar (see refreshProjects/refreshProjectTree).
 * Extracted into its own hook (rather than left inline in ProfileRail) so the
 * focus/visibility wiring is unit-testable without rendering the whole rail.
 * `enabled` false skips it, for a picker that only stands in for the rail on
 * some hosts.
 */
export function useProfileRailRefreshOnActive(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    void refreshActiveProfile()

    const onActive = () => {
      if (document.visibilityState === 'hidden') {
        return
      }

      void refreshActiveProfile()
    }

    window.addEventListener('focus', onActive)
    document.addEventListener('visibilitychange', onActive)

    return () => {
      window.removeEventListener('focus', onActive)
      document.removeEventListener('visibilitychange', onActive)
    }
  }, [enabled])
}
