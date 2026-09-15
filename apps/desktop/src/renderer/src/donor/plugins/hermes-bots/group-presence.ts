/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/plugins/hermes-bots/group-presence.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
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
