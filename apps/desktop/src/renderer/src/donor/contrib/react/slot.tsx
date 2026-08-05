/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/contrib/react/slot.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { ContribBoundary } from './boundary'
import { useContributions } from './use-contributions'

export interface SlotProps {
  /** Area id whose contributions render inline, in order. */
  area: string
}

/** Renders a bar area: ordered inline items `[...core, ...plugin]`. */
export function Slot({ area }: SlotProps) {
  const items = useContributions(area)

  if (items.length === 0) {
    return null
  }

  return (
    <>
      {items.map(c => (
        <ContribBoundary id={c.id} key={`${c.source ?? 'core'}:${c.id}`} variant="chip">
          {c.render?.()}
        </ContribBoundary>
      ))}
    </>
  )
}
