/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/connectors/catalog-mark.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

export function CatalogMark({ className }: { className?: string }) {
  const { t } = useI18n()
  const label = t.connectorsPage.card.inCatalog

  return (
    <Tip label={label}>
      <span
        aria-label={label}
        className={cn('relative z-10 flex shrink-0 items-center text-(--ui-text-quaternary)', className)}
        role="img"
      >
        <Codicon name="verified-filled" size="0.75rem" />
      </span>
    </Tip>
  )
}
