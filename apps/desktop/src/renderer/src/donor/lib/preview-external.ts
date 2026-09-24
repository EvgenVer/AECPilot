/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/preview-external.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Admission for URLs handed up by the preview guest preload
// (electron/preview-guest-preload.ts, `preview-open-external` channel).
//
// A guest page chose this URL, not the user typing it, so the scheme set is
// strictly the web subset of what main's `openExternalUrl` accepts. `file:`
// stays out on purpose: main's opener does open local files, but that
// capability belongs to host-driven surfaces (the artifacts panel), and an
// untrusted preview page must never reach `shell.openPath` through us.

export const PREVIEW_EXTERNAL_CHANNEL = 'preview-open-external'

export function admitPreviewExternalUrl(rawUrl: string): boolean {
  const raw = String(rawUrl ?? '').trim()

  if (!raw) {
    return false
  }

  try {
    const { protocol } = new URL(raw)

    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
