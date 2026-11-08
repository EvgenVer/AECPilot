/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/preview-edit.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

// URLs of preview targets that have unsaved spot-editor changes, keyed by
// `target.url` so the rail can render a VS Code-style "modified" dot on the tab
// without threading editor state up through the pane. The editor in
// `preview-file.tsx` is the sole writer; the rail tabs are the readers.
export const $dirtyPreviewUrls = atom<Record<string, true>>({})

export function setPreviewDirty(url: string, dirty: boolean): void {
  if (!url) {
    return
  }

  const current = $dirtyPreviewUrls.get()
  const has = Boolean(current[url])

  if (dirty === has) {
    return
  }

  if (dirty) {
    $dirtyPreviewUrls.set({ ...current, [url]: true })

    return
  }

  const next = { ...current }
  delete next[url]
  $dirtyPreviewUrls.set(next)
}
