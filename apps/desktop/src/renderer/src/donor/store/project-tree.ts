/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/project-tree.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
