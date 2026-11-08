/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/projects/index.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Public surface of the project/worktree sidebar, consumed by the sidebar root.
export { EnteredProjectContent } from './entered-content'
export { enteredProjectLiveRows } from './gateway-project-rows'
export {
  orderProjectsByIds,
  PROJECT_PREVIEW_COUNT,
  projectTreeCwd,
  sortProjectsForOverview,
  useRepoWorktreeMap
} from './model'
export { ProjectBackRow, ProjectOverviewRow } from './overview-row'
export { ProjectMenu } from './project-menu'
export { useGatewayProjectTree } from './use-gateway-project-tree'
export { SidebarWorkspaceGroup } from './workspace-group'
export {
  excludeProjectSessions,
  liveSessionProjectId,
  overlayLiveLanes,
  overlayLivePreviews,
  projectOwnerBySessionId,
  reconcileEnteredProjectSessions,
  sessionBucketId,
  sessionMatchesProjectFilter,
  sessionRecency,
  type SidebarProjectTree,
  type SidebarSessionGroup,
  type SidebarWorkspaceTree
} from './workspace-groups'
export { StartWorkButton } from './workspace-header'
