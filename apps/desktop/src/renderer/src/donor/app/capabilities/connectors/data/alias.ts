/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/data/alias.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
