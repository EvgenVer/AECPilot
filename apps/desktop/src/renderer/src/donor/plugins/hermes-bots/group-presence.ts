/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-presence.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
