/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-slash.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
