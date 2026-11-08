/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/contrib/workspace-page-header.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Page-owned header controls (#123597). A page route can render in the
 * workspace pane, whose zone paints `WORKSPACE_PAGE_HEADER_AREA` as the page
 * header, or in a route tile, where nothing reads that area. The control asks
 * WHERE it renders instead of reading the window-global `$workspaceIsPage`,
 * which can't tell a tile's mount from the workspace's.
 */

import { createContext, type ReactNode, useContext } from 'react'

import { Contribute } from '@/contrib/react/contribute'

import { WORKSPACE_PAGE_HEADER_AREA } from '../routes'

/** True inside the workspace pane's routes, whose zone paints the page header.
 *  Provided only by the workspace pane registration (controller.tsx). The
 *  default is false, so any other host fails safe to rendering inline. */
export const WorkspacePageHeaderHostContext = createContext(false)

/** Page-owned control: projected into the workspace page header when this
 *  subtree is hosted by it; rendered inline, in place, anywhere else. */
export function WorkspacePageHeaderControl({ children, id }: { children: ReactNode; id: string }) {
  return useContext(WorkspacePageHeaderHostContext) ? (
    <Contribute area={WORKSPACE_PAGE_HEADER_AREA} id={id}>
      {children}
    </Contribute>
  ) : (
    <>{children}</>
  )
}
