/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-session-actions/branch-boundary.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { BranchMessage } from './utils'

/**
 * The durable row a message-level branch keeps through: the highest row id the selected bubble
 * shows. An assistant bubble folds several rows (tool-call turns, then its answer), and each
 * text part keeps the row it came from, so the bubble's own `rowId` (its FIRST row) would cut the
 * answer off. The authority pulls in the tool results that directly answer an assistant boundary.
 * Undefined when the bubble has no durable row yet (an optimistic, unsettled message).
 */
export function branchThroughRowId(messages: readonly BranchMessage[]): number | undefined {
  const source = messages.at(-1)?.source

  if (!source) {
    return undefined
  }

  const ids = [
    source.rowId,
    ...source.parts.map(part => (part.type === 'text' ? part.sourceRowId : undefined))
  ].filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)

  return ids.length ? Math.max(...ids) : undefined
}
