/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session-import/api.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { requestGatewayForAgent } from '@/store/gateway'
import type { SessionOwnerRoute } from '@/store/session-request-router'

export interface ForeignSession {
  id: string
  source: 'claude' | 'codex'
  label: string
  title: string
  cwd: string | null
  mtime: number
  turn_count: number
  excerpt: string
}

export interface ForeignPage {
  sessions: ForeignSession[]
  next_offset: number | null
  host: string
  unreadable: number
}

export interface ForeignPreview {
  truncated: boolean
  messages: { role: string; content: string }[]
  total: number
  already_imported: string | null
  cwd: string | null
}

export interface ForeignImportResult {
  session_id: string
  already_imported: boolean
}

export function foreignRequest<T>(
  owner: SessionOwnerRoute,
  method: 'list' | 'preview' | 'import',
  params: Record<string, unknown>,
  signal?: AbortSignal
) {
  return requestGatewayForAgent<T>(
    owner.connectionId,
    owner.profile,
    `session.foreign.${method}`,
    params,
    60_000,
    signal
  )
}
