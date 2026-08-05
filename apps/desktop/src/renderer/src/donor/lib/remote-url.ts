/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/remote-url.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * remote-url.ts
 *
 * Renderer-side twin of the scheme coercion in
 * electron/connection-config.ts `normalizeRemoteBaseUrl()`. Users routinely
 * paste scheme-less "host:port" (a Tailscale IP, a LAN hostname) into the
 * remote-gateway URL field; without coercion the renderer's `^https?://`
 * probe gates never fire and the field just sits idle with no feedback.
 *
 * Keep the opt-out regex in sync with the electron side: only a real
 * `scheme://` prefix skips the http:// prepend, so explicit non-http schemes
 * (ws://, ftp://) still reach main-process validation and get a clear error.
 */
export function coerceRemoteUrlScheme(rawUrl: string): string {
  const value = String(rawUrl || '').trim()

  if (!value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value
  }

  return `http://${value}`
}
