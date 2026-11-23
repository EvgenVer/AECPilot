/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tool/run-ticker.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Children, type CSSProperties, isValidElement, type ReactNode } from 'react'

/**
 * A one-line window over a growing list of rows.
 *
 * Each new row slides the one before it up and out, so activity that would
 * otherwise grow down the page reads as a single line ticking over in place.
 * Rows are clipped to a uniform line box so the reel's offset stays exact
 * whatever a row happens to contain.
 *
 * Shared by the tool run (its calls) and a delegation card (each subagent's
 * relayed stream), which are the same thing seen from two sides.
 */
export function ToolRunTicker({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children)

  return (
    <div className="tool-ticker" data-tool-ticker="">
      <div className="tool-ticker__reel" style={{ '--tool-ticker-index': rows.length - 1 } as CSSProperties}>
        {rows.map((row, index) => (
          <div className="tool-ticker__row" key={isValidElement(row) ? (row.key ?? index) : index}>
            {row}
          </div>
        ))}
      </div>
    </div>
  )
}
