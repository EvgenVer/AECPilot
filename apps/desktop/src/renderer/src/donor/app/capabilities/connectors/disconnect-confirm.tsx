/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/disconnect-confirm.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useI18n } from '@/i18n'
import { readableError } from '@/store/notifications'

import { accountName, pickAccount } from './data/join'
import type { WriteOutcome } from './data/mutations'
import type { AccountRow, ConnectorCardModel } from './types'

/** A remove scoped to one account, or the app-level disconnect of the account its summary speaks for. */
export interface Disconnecting {
  account?: AccountRow
  card: ConnectorCardModel
}

export interface DisconnectConfirmProps {
  accounts: readonly AccountRow[]
  disconnect: (connectionId: string) => Promise<WriteOutcome>
  onClose: () => void
  /** The app-level disconnect finished; a one-account remove keeps the dialog open on the other accounts. */
  onDisconnected: () => void
  target: Disconnecting | null
}

export function DisconnectConfirm({ accounts, disconnect, onClose, onDisconnected, target }: DisconnectConfirmProps) {
  const { t } = useI18n()
  const copy = t.connectorsPage
  const scoped = target?.account

  return (
    <ConfirmDialog
      confirmLabel={scoped ? copy.accounts.remove : copy.dialog.disconnect}
      description={scoped ? copy.accounts.removeBody : copy.dialog.disconnectBody}
      destructive
      onClose={onClose}
      onConfirm={async () => {
        const account = target ? (target.account ?? pickAccount(accounts, target.card.slug)) : undefined

        if (!account) {
          throw new Error(copy.page.disconnectNoAccount)
        }

        const outcome = await disconnect(account.connection_id)

        if (!outcome.ok) {
          throw new Error(
            outcome.error.reason === 'ACCOUNTS_UNAVAILABLE'
              ? copy.page.disconnectRefused
              : readableError(outcome.error, copy.page.writeFailed).message
          )
        }

        if (!scoped) {
          onDisconnected()
        }
      }}
      open={target !== null}
      title={
        scoped && target
          ? copy.accounts.removeTitle(target.card.name, accountName(scoped))
          : copy.dialog.disconnectTitle(target?.card.name ?? '')
      }
    />
  )
}
