/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/chat/scaffold-row.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ReactNode } from 'react'

import { DisclosureRow } from '@/components/chat/disclosure-row'

/**
 * Transcript scaffolding: the quiet lines around the reply that say what the
 * agent did rather than what it said — a thinking header, a settled tool run,
 * the live activity ticker.
 *
 * They all render through here so they cannot drift apart. They used to each
 * pick their own grey — a thinking header painted `--ui-text-secondary`, a tool
 * summary `--ui-text-tertiary`, both under the same opacity — which read as two
 * different kinds of line for what is one kind of thing.
 *
 * The resting fade is the other half and lives in CSS, on the *block* that
 * holds the row rather than on the row: mark it `data-conversation-scaffold`.
 * A surface that skips the mark reads a shade brighter than its neighbours.
 */
export const SCAFFOLD_LABEL_CLASS =
  'text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height) text-(--conversation-scaffold-text)'

/** Durations, counts and diff stats trailing a scaffold label. */
export const SCAFFOLD_META_CLASS = 'shrink-0 text-[0.625rem] tabular-nums text-(--conversation-scaffold-meta)'

/**
 * One scaffold line. `children` is the label and whatever trails it in flow
 * (meta, diff counts); `trailing` overlays the right edge for a live timer.
 */
export function ScaffoldRow({
  children,
  onToggle,
  open = false,
  trailing
}: {
  children: ReactNode
  onToggle?: () => void
  open?: boolean
  trailing?: ReactNode
}) {
  return (
    <DisclosureRow onToggle={onToggle} open={open} trailing={trailing}>
      <span className="flex min-w-0 items-center gap-1.5">{children}</span>
    </DisclosureRow>
  )
}
