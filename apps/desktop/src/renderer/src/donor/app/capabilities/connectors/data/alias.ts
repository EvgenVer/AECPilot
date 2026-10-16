/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/data/alias.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { AccountRow } from '../types'

/** The gateway's account-name format (`ConnectorAlias` in the connector contracts). */
const ACCOUNT_ALIAS = /^[a-z0-9][a-z0-9-]{0,31}$/

export type AliasProblem = 'invalid' | 'taken'

/** Why `alias` cannot name an account among `accounts`, or null when it can. `self` is the account being renamed. */
export function aliasProblem(alias: string, accounts: readonly AccountRow[], self?: string): AliasProblem | null {
  if (!ACCOUNT_ALIAS.test(alias)) {
    return 'invalid'
  }

  return accounts.some(account => account.alias === alias && account.connection_id !== self) ? 'taken' : null
}
