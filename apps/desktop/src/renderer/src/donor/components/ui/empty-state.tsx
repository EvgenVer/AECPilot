/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/empty-state.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { cn } from '@/lib/utils'

// Canonical centered empty state (title + description). The default for "no
// results / nothing here yet" page bodies. For richer master-detail lists that
// want an icon + action, use PanelEmpty (overlays/panel); the file-tree's
// inline uppercase error state is its own deliberately-distinct treatment.
export function EmptyState({
  title,
  description,
  className
}: {
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn('grid min-h-48 place-items-center text-center', className)}>
      <div>
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-1 text-xs text-muted-foreground">{description}</div>}
      </div>
    </div>
  )
}
