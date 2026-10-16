/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_connector_accounts.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
