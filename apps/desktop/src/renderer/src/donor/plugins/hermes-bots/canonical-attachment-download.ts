/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/canonical-attachment-download.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Use the existing browser-download -> Electron Save File workflow, not composer staging.
 * Mirrors downloadTextFile and #104199's attachment delivery without a new native IPC. */
export function downloadCanonicalAttachment(bytes: Uint8Array<ArrayBuffer>, name: string, mime: string, signal?: AbortSignal) {
  if (signal?.aborted) {return}
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener noreferrer'
  link.style.display = 'none'
  document.body.appendChild(link)

  try {
    if (!signal?.aborted) {link.click()}
  } finally {
    link.remove()
    // Keep the object URL alive while Chromium hands the bytes to its download manager.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
