/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/shiki-block.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

/**
 * The ONLY static importer of `react-shiki` (and through it the multi-MB
 * shiki language/theme bundle). Every consumer reaches this module through
 * `React.lazy(() => import('./shiki-block'))` — see `LazyShiki` in
 * shiki-highlighter.tsx — so the shiki chunk stays entirely off the
 * cold-start path and loads on the first highlighted code block instead.
 *
 * Do NOT import this module statically from anything the entry graph
 * reaches, or the chunk moves back into boot.
 */
import ShikiHighlighter from 'react-shiki'

export default ShikiHighlighter
