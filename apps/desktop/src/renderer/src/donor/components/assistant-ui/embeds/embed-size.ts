/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/embed-size.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Shared height cap for inline embeds. Ratio embeds cap their width off this in
// UrlEmbed so height follows the aspect ratio; fenced renderers (mermaid, svg)
// reuse it directly. Pure CSS — no measuring.
export const EMBED_MAX_H = '33dvh'

// Fallback height (px) for non-ratio embeds that don't declare one: the consent
// placeholder, the intrinsic-size hint, and social frames until they measure.
export const EMBED_DEFAULT_H = 320
