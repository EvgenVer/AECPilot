/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/row-button.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import * as React from 'react'

/**
 * A full-row / region click target rendered as a real `<button>`: bakes in
 * `type="button"` + a stable `data-slot`, imposes no styling (callers keep their
 * own layout classes, so nothing changes visually). Use for row/region targets;
 * use `Button` for ordinary compact actions.
 */
function RowButton({ className, type = 'button', ...props }: React.ComponentProps<'button'>) {
  return <button className={className} data-slot="row-button" type={type} {...props} />
}

export { RowButton }
