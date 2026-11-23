/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/empty-state.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
