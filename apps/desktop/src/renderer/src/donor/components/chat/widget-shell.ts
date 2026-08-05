/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/widget-shell.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Inline transcript widgets — the few tool results that render as a panel the
 * user reads or acts on (a clarify question, an artifact card) rather than as
 * a scaffold line.
 *
 * They share one shell so they cannot drift apart. They used to each pick their
 * own: clarify sat on a 2px radius over the chat backdrop's own color (a card
 * you could only see by its hairline), the artifact card on a hardcoded 10px
 * over nothing. One radius one rung above the composer, one mode-derived fill,
 * no border — the surface reads as a surface on the fill alone.
 */
export const WIDGET_SHELL_CLASS = 'rounded-3xl bg-(--ui-widget-surface-background) px-3.5 py-3'
