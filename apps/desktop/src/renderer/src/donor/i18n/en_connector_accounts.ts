/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_connector_accounts.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { Translations } from './types'

export const enConnectorAccounts: Translations['connectorsPage']['accounts'] = {
  heading: 'Accounts',
  count: (count: number) => `${count} account${count === 1 ? '' : 's'}`,
  addAnother: 'Add another account',
  aliasLabel: 'Account name',
  aliasHint: 'Lowercase letters, numbers and dashes, up to 32. For example work or home.',
  aliasInvalid: 'Use lowercase letters, numbers and dashes, starting with a letter or number.',
  aliasTaken: 'That name is already used.',
  add: 'Connect',
  rename: 'Rename',
  renameLabel: (name: string) => `New name for ${name}`,
  renameGone: 'That account is no longer there. It was removed or replaced by a reconnect.',
  remove: 'Remove',
  removeTitle: (app: string, name: string) => `Remove the ${name} ${app} account?`,
  removeBody: 'Hermes stops acting as this account. Your other accounts stay connected.',
  retiredCount: (count: number) => `${count} retired`,
  status: {
    expired: 'Access expired',
    failed: 'Could not connect',
    inactive: 'Inactive',
    pending: 'Waiting for sign-in',
    retired: 'Replaced by a reconnect',
    revoked: 'Access revoked'
  }
}
