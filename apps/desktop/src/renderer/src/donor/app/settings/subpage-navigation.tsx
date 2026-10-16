/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/subpage-navigation.tsx
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
