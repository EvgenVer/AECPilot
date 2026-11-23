/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_memory_layers.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Settings > Memory & Context and Command Center > Maintenance:
// the active (saved) memory provider, a selected-but-unsaved one, and the
// built-in MEMORY.md / USER.md layer; `Translations.settings.memoryLayers`.
export interface MemoryLayersTranslations {
  activeProvider: string
  selectedProvider: string
  /** `current` is the active provider's name or `builtinMemory`. */
  selectedDesc: (current: string) => string
  builtinMemory: string
  noProvider: string
  noProviderDesc: string
  providerDesc: (name: string) => string
  providerNotReadyDesc: (name: string) => string
  providerUnknownDesc: (name: string) => string
  statusUnavailable: string
  statusUnavailableDesc: string
  retry: string
  status: {
    ready: string
    needs_config: string
    unavailable: string
    missing: string
  }
  builtinLayer: string
  onByDefault: string
  on: string
  off: string
  onlyFile: (file: string) => string
  builtinDesc: string
}
