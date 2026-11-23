/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/backup-settings.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] removed the Transfer to Hermes Cloud card, its sign-in, agent discovery,
 *       progress and undo views and the intro line that names it — SPEC HX3
 *       (owner decision 2026-11-23, task T90)
 *   [4] dropped the imports only that card used (`lib/hermes-cloud-agents`,
 *       `lib/agent-transfer` transfer half, `backup-transfer-views`, the Webapp
 *       OAuth paste field, the portal link, the router, the cloud icons)
 *   [1] `backup()` (their `lib/hermes-cloud-agents`, which reads the archive back
 *       through the gateway) → `hermes backup` by REST plus our `saveBackupOut`
 *       bridge: the main process copies the archive to the place the person picks
 *       (SPEC UR57, task T90)
 */
import { useStore } from '@nanostores/react'
import { useMemo, useState } from 'react'

import { hermesApiAs } from '@/api/client'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import type { BackupTransferTranslations } from '@/i18n/types_backup_transfer'
import { runBackup, type TransferEndpoint, type TransferRequestFn } from '@/lib/agent-transfer'
import { Archive } from '@/lib/icons'
import { $activeConnectionId } from '@/store/connections'
import { notifyError } from '@/store/notifications'
import { $settingsScopeProfile } from '@/store/settings-scope'

import { SettingsContent, SettingsSection } from './primitives'

type Copy = BackupTransferTranslations

// EDIT [1]: their `backup()` (lib/hermes-cloud-agents) ran the same `hermes backup` and then
// pulled the archive through the gateway's download route — a route our bridge denies, because
// the archive holds the profile's keys and sign-ins as plain text (rule R2). The archive stays
// on disk; our main process checks it is one the core's backup route wrote, shows Save As and
// removes it from the core's home afterwards. A closed dialog is `null`: nothing was saved and
// nothing is kept, so there is no line to show.
const request: TransferRequestFn = (owner, req) => hermesApiAs(owner, req)

async function backup(
  owner: TransferEndpoint,
  onLine?: (line: string) => void
): Promise<{ archive: string; saved: boolean } | null> {
  const archive = await runBackup(request, owner, onLine)
  const result = await window.aecpilot.saveBackupOut(archive)

  if (result.error) {
    throw new Error(result.error)
  }

  return result.saved ? { archive, saved: true } : null
}

/** `hermes backup` of the whole Hermes home, saved to a file the user picks. */
function BackupCard({ copy, owner }: { copy: Copy; owner: TransferEndpoint }) {
  const [busy, setBusy] = useState(false)
  const [lastLine, setLastLine] = useState('')
  const [result, setResult] = useState<{ archive: string; saved: boolean } | null>(null)

  const run = async () => {
    setBusy(true)
    setResult(null)

    try {
      setResult(await backup(owner, setLastLine))
    } catch (error) {
      notifyError(error, copy.backupFailed)
    } finally {
      setBusy(false)
      setLastLine('')
    }
  }

  return (
    <SettingsSection icon={Archive} title={copy.backupTitle}>
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{copy.backupHelp}</p>
        <Button disabled={busy} onClick={() => void run()} variant="secondary">
          {busy ? copy.backupRunning : copy.backup}
        </Button>
      </div>
      {busy && lastLine && <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{lastLine}</p>}
      {result && (
        <p className="mt-2 text-xs text-muted-foreground">
          {result.saved ? copy.backupSaved : copy.backupKept(result.archive)}
        </p>
      )}
    </SettingsSection>
  )
}

// EDIT [3]: their `useCloudAgents`, `doneBody` and `TransferCard` (Transfer to Hermes Cloud) are HX3.

/**
 * Settings ▸ Backup & Transfer. Acts on the profile Settings is editing on the active connection;
 * the mount site keys it by that owner, so a scope switch remounts it and a flow never splits.
 */
export function BackupSettings() {
  const { t } = useI18n()
  const copy = t.settings.backup
  const profile = useStore($settingsScopeProfile)
  const connectionId = useStore($activeConnectionId)
  const owner = useMemo(() => ({ connectionId, profile }), [connectionId, profile])

  // EDIT [3]: the intro line and the transfer card (HX3) are not rendered.
  return (
    <SettingsContent>
      <BackupCard copy={copy} owner={owner} />
    </SettingsContent>
  )
}
