/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/types.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Shared prop contract for fenced-block renderers (mermaid, svg). Kept in its
// own module so renderers and the registry can both import it without a cycle.
export interface RichFenceProps {
  code: string
  /** True while the surrounding message is still streaming. Renderers that can
   *  throw on partial input (e.g. mermaid) defer until this is false. */
  streaming?: boolean
}
