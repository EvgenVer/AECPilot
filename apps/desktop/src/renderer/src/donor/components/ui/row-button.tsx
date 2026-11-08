/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/row-button.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
