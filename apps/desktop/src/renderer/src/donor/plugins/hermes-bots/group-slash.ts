/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-slash.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { host } from '@hermes/plugin-sdk'

import { botsText } from './i18n'

/** Group rooms cannot dispatch slash commands. Keep command-shaped input out
 * of member prompts without rejecting paths such as /etc/hosts. */
export function rejectGroupSlashCommand(text: string): boolean {
  if (!/^\/[a-z][\w-]*(?:\s|$)/i.test(text)) {
    return false
  }

  host.notify({
    kind: 'warning',
    message: botsText().group.slashCommandsUnsupported
  })

  return true
}
