/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/workspace-session-target.ts
 * Commit:  5fc308a70719a83cccdbba4c0e39c23f5a8239d5 (v2026.8.27)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { MutableRefObject } from 'react'

import { followActiveSessionCwd, resolveNewSessionCwd } from '@/store/projects'
import {
  $newChatWorkspaceTargetGeneration,
  type NewChatWorkspaceTarget,
  setCurrentBranch,
  setCurrentCwd,
  setNewChatWorkspaceTarget
} from '@/store/session'

interface WorkspaceSessionOptions {
  activeSessionIdRef: MutableRefObject<string | null>
  followActiveSessionCwd?: (cwd: string) => void | Promise<void>
  onExplicitWorkspace?: (cwd: string) => void
  path: null | string
  requestGateway: <T>(method: string, params?: Record<string, unknown>) => Promise<T>
  startFreshSessionDraft: (options?: { workspaceTarget: NewChatWorkspaceTarget }) => void
}

export function startWorkspaceSession({
  activeSessionIdRef,
  followActiveSessionCwd: followCwd = followActiveSessionCwd,
  onExplicitWorkspace,
  path,
  requestGateway,
  startFreshSessionDraft
}: WorkspaceSessionOptions): void {
  // Home's "+" passes path=null on purpose ("no folder"). That must stay
  // detached — do NOT fall through to resolveNewSessionCwd(), which can still
  // return a default/remembered project folder and re-attach the last repo
  // (digitwo: New session in Home still shows `main`).
  if (path === null) {
    startFreshSessionDraft({ workspaceTarget: null })

    return
  }

  // A worktree lane carries its own path. Empty string (legacy/path-less trunk)
  // can fall back to the active project's root, but null was handled above.
  const explicitTarget = path.trim()
  const target = explicitTarget || resolveNewSessionCwd()

  startFreshSessionDraft(target ? { workspaceTarget: target } : undefined)

  if (!target) {
    return
  }

  const workspaceGeneration = $newChatWorkspaceTargetGeneration.get()

  setCurrentCwd(target)
  void requestGateway<{ branch?: string; cwd?: string }>('config.get', { key: 'project', cwd: target })
    .then(info => {
      if ($newChatWorkspaceTargetGeneration.get() !== workspaceGeneration || activeSessionIdRef.current) {
        return
      }

      const resolved = info.cwd || target

      setCurrentCwd(resolved)
      setNewChatWorkspaceTarget(resolved)
      setCurrentBranch(info.branch || '')

      if (explicitTarget) {
        onExplicitWorkspace?.(resolved)
        void followCwd(resolved)
      }
    })
    .catch(() => {
      if ($newChatWorkspaceTargetGeneration.get() === workspaceGeneration && !activeSessionIdRef.current) {
        setCurrentBranch('')
      }
    })
}
