/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/connection-glyph.tsx
 * Commit:  29112bef099274229cadff79cdff7bf7b99c4b77 (v2026.8.31)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { DesktopRegistryConnection } from '@/global'
import { Cloud, Monitor, Network, Terminal } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { SIDEBAR_ROW_LEAD } from './row-geometry'

// One glyph per connection kind — device, cloud, network, terminal — shared by
// the statusbar switcher, its menu, the fleet profile rail and the Bots rail so
// a gateway looks the same wherever it is named. Dependency-free on purpose
// (icons, a type and class strings) so light components can use it without
// pulling in stores.
export function ConnectionGlyph({
  className,
  connection
}: {
  className?: string
  connection: Pick<DesktopRegistryConnection, 'kind'>
}) {
  const Icon =
    connection.kind === 'local'
      ? Monitor
      : connection.kind === 'cloud'
        ? Cloud
        : connection.kind === 'ssh'
          ? Terminal
          : Network

  return (
    <span
      aria-hidden="true"
      className={cn(SIDEBAR_ROW_LEAD, 'text-(--ui-text-quaternary)', className)}
      data-connection-kind={connection.kind}
      data-slot="connection-glyph"
    >
      <Icon className="size-3" />
    </span>
  )
}
