/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_update_channel.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** About ▸ Updates: the source checkout's update channel selector. */
export interface UpdateChannelCopy {
  title: string
  description: string
  stable: string
  main: string
  stableConfirmTitle: string
  stableConfirmBody: string
  stableConfirm: string
  failed: string
  /** Version details: the row naming this install's update channel. */
  detailsLabel: string
  /** A source checkout following a branch other than main. */
  branch: (name: string) => string
  /** Updates overlay: opens Settings › About › Updates, where the channel is chosen. */
  change: string
  /** Up to date on stable: names the release the install is pinned to. */
  latestRelease: (version: string) => string
  /** Updates overlay title: the stable release is older than this checkout (a rollback). */
  rollbackTitle: (version: string) => string
  /** Installing the older stable release moves the checkout back; says so plainly. */
  rollbackBody: (version: string) => string
  /** Updates overlay install button for that rollback. */
  rollbackAction: (version: string) => string
}
