/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/download-text.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { downloadBlob } from '@/lib/download'

/** Save generated text content to a file via a blob download. */
export function downloadTextFile(name: string, content: string, mimeType = 'text/plain') {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), name)
}
