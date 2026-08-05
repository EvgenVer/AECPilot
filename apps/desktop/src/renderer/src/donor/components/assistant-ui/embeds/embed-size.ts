/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/embed-size.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Shared height cap for inline embeds. Ratio embeds cap their width off this in
// UrlEmbed so height follows the aspect ratio; fenced renderers (mermaid, svg)
// reuse it directly. Pure CSS — no measuring.
export const EMBED_MAX_H = '33dvh'
