/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/fail.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export function EmbedFail({ label }: { label: string }) {
  return (
    <span className="grid min-h-32 w-full place-items-center p-4">
      <span className="text-xs font-medium text-(--ui-red)">Failed to load {label} embed</span>
    </span>
  )
}
