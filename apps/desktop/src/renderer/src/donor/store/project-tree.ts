/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/project-tree.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import type { SidebarProjectTree } from '@/app/chat/sidebar/projects/workspace-groups'

// The project tree atom lives in this leaf so store/session-states.ts can
// read it (a focused tile's session is often older than the paginated recents
// page, so the tree is the only loaded copy of its row, #76535) without
// pulling store/projects.ts — and through it store/gateway.ts — into every
// suite that partially mocks the gateway. store/projects.ts owns all writes
// and re-exports the atom so existing call sites keep their import path.
export const $projectTree = atom<SidebarProjectTree[]>([])
