/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-prompt-actions/browser-manage-refusal.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { hostHas } from '@/lib/host-capabilities'

// A remote connection refuses /browser connect|disconnect: both drive the CDP
// connection inside the gateway process. The Webapp is always remote and has no
// local gateway to switch to, so it names the machine the command acts on instead.
export const remoteBrowserManageRefusal = (action: 'connect' | 'disconnect'): string =>
  hostHas('webappCopy')
    ? `/browser ${action} isn't available in the Webapp — it manages a Chromium-family browser on the machine running Hermes. Run it from Hermes Desktop or the CLI on that machine.`
    : '/browser connect manages a Chromium-family browser on the gateway host — only available when connected to a local gateway.'
