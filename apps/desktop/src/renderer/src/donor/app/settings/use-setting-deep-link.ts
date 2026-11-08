/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/use-setting-deep-link.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useCallback } from 'react'

import { settingDefinition, settingElementId } from './settings-manifest'
import type { SettingsView } from './types'
import { useDeepLinkHighlight } from './use-deep-link-highlight'

/**
 * Land a palette hit (`?setting=<id>`) on a manifest row of this view: once
 * the row's subpage is showing, scroll to it and flash it. Pages with no
 * subpages pass no `show`; pages with subpages pass the same predicate that
 * gates their rows so the highlight waits for the right child page.
 */
export function useSettingDeepLink(view: SettingsView, show: (subpage: string | undefined) => boolean = () => true) {
  const ready = useCallback(
    (id: string) => {
      const setting = settingDefinition(view, id)

      return setting !== undefined && show(setting.subpage)
    },
    [show, view]
  )

  return useDeepLinkHighlight({ elementId: settingElementId, param: 'setting', ready })
}
