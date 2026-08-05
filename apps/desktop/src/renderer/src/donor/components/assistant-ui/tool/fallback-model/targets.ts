/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tool/fallback-model/targets.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ToolPart } from './types'

export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function looksLikePath(value: string): boolean {
  return /^file:\/\//i.test(value) || /^(?:\/|\.{1,2}\/|~\/).+/.test(value)
}

export function isPreviewableTarget(target: string): boolean {
  return Boolean(
    target &&
    (/^file:\/\//i.test(target) ||
      /^(?:\/|\.{1,2}\/|~\/).+\.html?$/i.test(target) ||
      /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(target))
  )
}

export function stableHash(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index)
  }

  return Math.abs(hash).toString(36)
}

export function toolPartDisclosureId(part: ToolPart): string {
  if (part.toolCallId) {
    return `tool:${part.toolCallId}`
  }

  return `tool:${part.toolName}:${stableHash(JSON.stringify(part.args ?? ''))}`
}

export function toolGroupDisclosureId(parts: ToolPart[]): string {
  return `tool-group:${parts.map(toolPartDisclosureId).join('|')}`
}

export const URL_PATTERN = /https?:\/\/[^\s'"<>)\]]+/i

export function findFirstUrl(...sources: unknown[]): string {
  for (const src of sources) {
    if (typeof src === 'string') {
      const m = src.match(URL_PATTERN)

      if (m) {
        return m[0]
      }
    } else if (src && typeof src === 'object') {
      for (const v of Object.values(src as Record<string, unknown>)) {
        const found = findFirstUrl(v)

        if (found) {
          return found
        }
      }
    }
  }

  return ''
}

export function hostnameOf(value: string): string {
  try {
    const url = new URL(value)

    return `${url.hostname}${url.pathname && url.pathname !== '/' ? url.pathname : ''}`
  } catch {
    return value
  }
}
