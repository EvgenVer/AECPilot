/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-session-actions/branch-create-key.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { SessionOwnerRoute } from '@/store/session-request-router'

import type { BranchMessage } from './utils'

interface BranchCreateKeyInput {
  branchCount?: number
  branchMessages: BranchMessage[]
  cwd?: string
  ownerRoute?: SessionOwnerRoute
  parentStoredId: null | string
  profile?: null | string
  sourceSessionId: null | string
}

const branchMessagesFingerprint = (messages: BranchMessage[]): string =>
  JSON.stringify(messages.map(({ content, role }) => [role, content]))

// Identity of one branch create, so a re-entered branch action (a retried
// renderer transition, a double right-click) rides the create already in
// flight instead of minting a second child. The OWNER is part of the identity:
// the same parent id served by two connections is two different sessions.
export function branchCreateKey({
  branchCount,
  branchMessages,
  cwd,
  ownerRoute,
  parentStoredId,
  profile,
  sourceSessionId
}: BranchCreateKeyInput): string {
  return JSON.stringify({
    branchCount: branchCount ?? null,
    connectionId: ownerRoute?.connectionId || null,
    cwd: cwd?.trim() || null,
    messages: sourceSessionId ? null : branchMessagesFingerprint(branchMessages),
    ownerProfile: ownerRoute?.profile || null,
    parentStoredId,
    profile: profile?.trim() || null,
    sourceSessionId
  })
}
