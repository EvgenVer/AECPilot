/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/subpage-navigation.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useI18n } from '@/i18n'

import { OverlayBreadcrumbHeader } from '../overlays/overlay-breadcrumb-header'
import type { OverlayNavGroup, OverlayNavLink } from '../overlays/overlay-split-layout'

export function SettingsSubpageHeader({ group, child }: { group: OverlayNavGroup; child?: OverlayNavLink }) {
  const { t } = useI18n()

  // A third rail level (a plugin's sub-page under Settings ▸ Plugins).
  const grandchild = child?.children?.find(link => link.active)

  return (
    <OverlayBreadcrumbHeader child={child} grandchild={grandchild} group={group} rootLabel={t.commandCenter.settings} />
  )
}
