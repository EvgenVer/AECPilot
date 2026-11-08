/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-slash.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
