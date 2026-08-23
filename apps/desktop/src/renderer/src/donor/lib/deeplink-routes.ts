/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/deeplink-routes.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { PluginInstallLegacyHint } from '@/store/plugin-install-request'

export interface DeepLinkPayload {
  kind: string
  name: string
  params: Record<string, string>
}

export type DeepLinkAction =
  | { type: 'plugin-install'; repo: string; enable: boolean; force: boolean; legacyHint: PluginInstallLegacyHint }
  | { type: 'composer-blueprint'; name: string; params: Record<string, string> }
  | { type: 'ignore' }

function truthyParam(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === '') {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()

  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

export function resolveDeepLinkAction(payload: DeepLinkPayload | null | undefined): DeepLinkAction {
  if (!payload?.kind) {
    return { type: 'ignore' }
  }

  if (payload.kind === 'blueprint' && payload.name) {
    return { type: 'composer-blueprint', name: payload.name, params: payload.params || {} }
  }

  const repo = (payload.params?.repo || payload.params?.identifier || payload.name || '').trim()

  if (payload.kind === 'plugin' && payload.name === 'install' && repo) {
    return {
      type: 'plugin-install',
      repo,
      enable: truthyParam(payload.params?.enable, true),
      force: truthyParam(payload.params?.force, false),
      legacyHint: null
    }
  }

  if (payload.kind === 'plugin-agent' && repo) {
    return {
      type: 'plugin-install',
      repo,
      enable: truthyParam(payload.params?.enable, true),
      force: truthyParam(payload.params?.force, false),
      legacyHint: 'agent'
    }
  }

  if (payload.kind === 'plugin-desktop' && repo) {
    return {
      type: 'plugin-install',
      repo,
      enable: truthyParam(payload.params?.enable, true),
      force: truthyParam(payload.params?.force, false),
      legacyHint: 'desktop'
    }
  }

  return { type: 'ignore' }
}
