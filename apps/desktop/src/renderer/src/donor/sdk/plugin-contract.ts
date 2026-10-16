/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/sdk/plugin-contract.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The plugin authoring contract types; the SDK barrel re-exports them.

export type {
  HermesPlugin,
  PetMessageTone,
  PetSayOptions,
  PluginAppActionId,
  PluginAppActionInfo,
  PluginContext,
  PluginContribution,
  PluginNativeNotificationInput,
  PluginNotificationAction,
  PluginOs,
  PluginPet,
  PluginRestOptions,
  PluginRunActionResult,
  PluginSettingsPage,
  PluginSettingsSubpage,
  PluginStorage
} from '@/contrib/plugin'
