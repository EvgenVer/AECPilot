/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-presence.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { computed } from '@hermes/plugin-sdk'

import { botRosterKey } from './data'
import { $groupChats } from './group-chat'

/** All presence consumers share the exact owner captured by the room driver. */
export const $activeGroupMemberKeys = computed(
  $groupChats,
  rooms =>
    new Set(
      Object.values(rooms).flatMap(room =>
        room.running && !room.tombstone && room.turn ? [botRosterKey(room.turn)] : []
      )
    )
)
