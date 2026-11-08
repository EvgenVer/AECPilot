/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/catalog/update-skills-button.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Button } from '@/components/ui/button'
import type { ProfileScope } from '@/hermes'
import { useI18n } from '@/i18n'
import { useStoreSelector } from '@/lib/use-session-slice'
import { $hubActions, UPDATE_ALL_KEY, updateHubSkills } from '@/store/hub-actions'
import { notify, notifyError } from '@/store/notifications'

export function UpdateSkillsButton({ profile }: { profile?: ProfileScope }) {
  const { t } = useI18n()
  const h = t.skills.hub
  const updating = useStoreSelector($hubActions, actions => actions[UPDATE_ALL_KEY]?.running ?? false)

  return (
    <Button
      disabled={updating}
      onClick={() => {
        notify({ kind: 'success', title: h.updateStarted, message: h.actionLog })
        void updateHubSkills(profile).catch(err => notifyError(err, h.actionFailed))
      }}
      size="xs"
      variant="text"
    >
      {updating ? h.updating : h.updateAll}
    </Button>
  )
}
