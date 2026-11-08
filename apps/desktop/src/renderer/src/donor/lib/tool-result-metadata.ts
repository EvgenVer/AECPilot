/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/tool-result-metadata.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Gateway display hints are not the tool's result. Keep them off the raw
 * payload so summaries cannot overwrite evidence, including false/null/"". */
export interface ToolResultMetadata {
  duration_s?: number
  error?: string | boolean
  inline_diff?: string
  message?: string
  preview?: string
  summary?: string
  todos?: unknown
}

export interface ToolResultSource {
  result?: unknown
  toolResultMetadata?: ToolResultMetadata
}

/** A derived record for existing presentation code; never stored as the result. */
export function toolResultRecord(source: ToolResultSource): Record<string, unknown> {
  let value = source.result

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = undefined
    }
  }

  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  // Authoritative result fields win over fallible/abbreviated display hints.
  return { ...source.toolResultMetadata, ...record }
}

/** The event's own account of a failure, for calls whose result carries none. */
export function envelopeErrorText(metadata: ToolResultMetadata | undefined): string {
  const text = typeof metadata?.error === 'string' ? metadata.error : metadata?.message

  return text?.trim() ?? ''
}
