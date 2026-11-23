/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_connectors.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface ConnectorCardTranslations {
  title: string
  connect: string
  skip: string
  cancel: string
  retry: string
  grant: string
  connected: string
  checking: string
  notConnected: string
  skipped: string
  disabled: string
  failed: string
  needsAuth: string
  opening: string
  waiting: string
  timeout: string
  refresh: string
  connectError: string
  connectErrorFor: (app: string) => string
  unavailable: string
  ownerMissing: string
  search: string
  empty: string
  disclaimer: string
  execution: string
  setup: (server: string) => string
  openInBrowser: string
  setupCancel: string
  authorizedToolsUnavailable: string
  required: string
  namedAccount: (app: string, alias: string) => string
  renameAccount: string
  directory: ConnectorDirectoryTranslations
}

/** The chat's directory card (`manage_connections` display) and the line it collapses to. */
export interface ConnectorDirectoryTranslations {
  suggested: string
  allApps: string
  receiptConnected: (apps: string) => string
  receiptNone: string
  receiptTimedOut: string
  /** A tile whose sign-in is open in the browser. */
  finishInBrowser: string
  /** A tile whose sign-in failed; clicking it starts the same sign-in again. */
  signInFailed: string
}

export interface ConnectorAccountsTranslations {
  heading: string
  count: (count: number) => string
  addAnother: string
  aliasLabel: string
  aliasHint: string
  aliasInvalid: string
  aliasTaken: string
  add: string
  rename: string
  renameLabel: (name: string) => string
  renameGone: string
  remove: string
  removeTitle: (app: string, name: string) => string
  removeBody: string
  retiredCount: (count: number) => string
  status: {
    expired: string
    failed: string
    inactive: string
    pending: string
    retired: string
    revoked: string
  }
}
