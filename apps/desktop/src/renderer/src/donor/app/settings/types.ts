/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/types.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { Dispatch, SetStateAction } from 'react'

import type { HermesGateway } from '@/hermes'
import type { IconComponent } from '@/lib/icons'
import type { EnvVarInfo } from '@/types/hermes'

export type SettingsView =
  | 'about'
  | 'billing'
  | 'gateway'
  | 'keybinds'
  | 'keys'
  | 'notifications'
  | 'plugins'
  | 'providers'
  | 'sessions'
  | `config:${string}`
export type EnvPatch = Partial<Pick<EnvVarInfo, 'is_set' | 'redacted_value'>>

export interface SettingsPageProps {
  gateway?: HermesGateway | null
  onClose: () => void
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
}

export interface ProviderGroup {
  name: string
  priority: number
  entries: [string, EnvVarInfo][]
  hasAnySet: boolean
}

export interface DesktopConfigSection {
  id: string
  label: string
  icon: IconComponent
  keys: string[]
}

export interface EnvRowProps {
  varKey: string
  info: EnvVarInfo
  edits: Record<string, string>
  revealed: Record<string, string>
  saving: string | null
  setEdits: Dispatch<SetStateAction<Record<string, string>>>
  onSave: (key: string) => void
  onClear: (key: string) => void
  onReveal: (key: string) => void
  compact?: boolean
}
