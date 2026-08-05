/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/download-text.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Save generated text content to a file via a blob download. Electron's
 *  default will-download behavior shows the OS save dialog, so this works
 *  without a dedicated IPC handler (same pattern as use-image-download's
 *  browser fallback). */
export function downloadTextFile(name: string, content: string, mimeType = 'text/plain') {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement('a')

  link.href = blobUrl
  link.download = name
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
}
