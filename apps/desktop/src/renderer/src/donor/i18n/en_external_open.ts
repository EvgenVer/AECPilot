/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_external_open.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ExternalOpenFailedCopy } from './types_external_open'

export const enExternalOpenFailed: ExternalOpenFailedCopy = {
  title: 'Couldn’t open this link',
  message: 'No browser is registered to open this address. Copy the link and open it manually.',
  copyUrl: 'Copy link',
  close: 'Close',
  missing: {
    title: 'File not found',
    message: 'This file does not exist — it may have been deleted or moved, or it lives on another machine.'
  }
}
