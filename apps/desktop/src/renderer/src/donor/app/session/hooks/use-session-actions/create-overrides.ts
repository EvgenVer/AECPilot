/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-session-actions/create-overrides.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface SessionCreateOverrides {
  /** Renderer-only handoff, fired at the stored-id assignment before navigation. */
  onComposerScopeAssigned?: (scope: string) => void
}

export type CreateBackendSessionForSend = (
  preview?: string | null,
  createOverrides?: SessionCreateOverrides
) => Promise<string | null>
