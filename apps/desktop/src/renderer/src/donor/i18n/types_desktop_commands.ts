/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_desktop_commands.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Transcript lines for the Desktop-side /rollback /agents /config /history /save /export /import
// /timestamps actions (slash-desktop-commands.ts). Counts arrive as strings, like sessionCommands.
export interface DesktopCommandNotices {
  error: (message: string) => string
  rollbackUsage: string
  checkpointsDisabled: string
  checkpointsEmpty: string
  checkpointsHeader: string
  checkpointsHint: string
  noDiff: string
  rollbackFailed: (error: string) => string
  unknownError: string
  restored: (hash: string) => string
  rewound: (count: string) => string
  reopenForRewind: string
  agentsEmpty: string
  subagentsHeader: (count: string) => string
  subagentFallback: string
  statusRunning: string
  toolCalls: (count: string) => string
  processesHeader: (count: string) => string
  configHeader: string
  configDefaults: string
  configFooter: string
  historyHeader: (count: string) => string
  historyEmpty: string
  historyYou: string
  historyHermes: string
  saveUsage: string
  saveLegacyRefused: string
  savedOnHost: (path: string) => string
  unknownPath: string
  saveUnsupported: string
  saveDialogTitle: string
  savedTo: (path: string) => string
  saveCancelled: string
  exportRemote: string
  importRemote: string
  timestampsUsage: string
  timestampsOn: string
  timestampsOff: string
}
