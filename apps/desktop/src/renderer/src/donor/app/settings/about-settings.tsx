/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/about-settings.tsx
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] dropped the update-channel row (`<UpdateChannelRow />`) — their release
 *       channels are SPEC HX4; our updater watches our own channel
 * (no other edits)
 */
import { useStore } from '@nanostores/react'
import { type ReactElement, useEffect } from 'react'

import { UpdateStatusCard, VersionHero } from '@/components/update-status'
import { VersionDetails } from '@/components/version-details'
import { useI18n } from '@/i18n'
import { RefreshCw } from '@/lib/icons'
import { $connection } from '@/store/session'
import { $desktopVersion, checkBackendUpdates, refreshDesktopVersion } from '@/store/updates'

import { SectionHeading, SettingsContent } from './primitives'
import { SETTING_IDS, settingElementId } from './settings-manifest'
import { UninstallSection } from './uninstall-section'
import { useSettingDeepLink } from './use-setting-deep-link'

interface AboutSettingsProps {
  subpage?: string
}

export function AboutSettings({ subpage }: AboutSettingsProps = {}): ReactElement {
  useSettingDeepLink('about', page => subpage === undefined || page === subpage)

  if (subpage === 'uninstall') {
    return (
      <SettingsContent>
        <UninstallSection />
      </SettingsContent>
    )
  }

  return <AppUpdatesSettings includeUninstall={subpage === undefined} />
}

interface AppUpdatesSettingsProps {
  includeUninstall: boolean
}

function AppUpdatesSettings({ includeUninstall }: AppUpdatesSettingsProps): ReactElement {
  const { t } = useI18n()
  const version = useStore($desktopVersion)
  const connection = useStore($connection)
  const remote = connection?.mode === 'remote'

  // Refresh the running version when About opens or the active gateway changes.
  useEffect((): void => {
    void refreshDesktopVersion()

    if (remote) {
      void checkBackendUpdates()
    }
  }, [connection, remote])

  return (
    <SettingsContent>
      <VersionHero version={version} />
      <div className="mx-auto mt-4 w-full max-w-2xl">
        <SectionHeading icon={RefreshCw} title={t.settings.about.updates} />
        <div className="grid gap-3" id={settingElementId(SETTING_IDS.about.updates)}>
          <UpdateStatusCard target="client" />
          {/* EDIT [3]: their <UpdateChannelRow /> stood here — SPEC HX4. */}
          {/* Client and remote backend updates are independent. Only the client has release notes. */}
          {remote && <UpdateStatusCard showReleaseNotes={false} target="backend" />}
        </div>
        {version && <VersionDetails version={version} />}
        {includeUninstall && <UninstallSection />}
      </div>
    </SettingsContent>
  )
}
