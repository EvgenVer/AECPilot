/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/desktop-toolsets.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] the 'tts' toolset row is hidden — all voice is SPEC HX19 (owner decision
 *       2026-10-07); the toolset itself is off via agent.disabled_toolsets
 * (no other edits)
 */
// Curation for the desktop "Skills & Tools → Toolsets" list.
//
// `GET /api/tools/toolsets` returns the full CONFIGURABLE_TOOLSETS set with no
// desktop-specific filter — so it surfaces entries that don't belong in a flat
// per-user toggle list on the desktop: platform-coupled toolsets (which
// `hermes tools` already platform-restricts on the CLI) and internal plumbing
// that isn't a user-facing capability. Mirror the curation approach used for
// slash commands (`desktop-slash-commands.ts`): one documented block-list, one
// predicate. Hiding a toolset only removes its row — its enabled state and
// runtime gating are untouched.
const DESKTOP_HIDDEN_TOOLSETS = new Set([
  // Platform-coupled — only meaningful when that platform is the active
  // adapter; `hermes tools` restricts these off the CLI too.
  'discord',
  'discord_admin',
  'yuanbao',
  // Internal plumbing, not a user capability toggle.
  'context_engine',
  'moa',
  // EDIT [3]: голос исключён целиком — SPEC HX19 (решение владельца 2026-10-07).
  'tts'
])

export function isDesktopToolsetVisible(name: string): boolean {
  return !DESKTOP_HIDDEN_TOOLSETS.has(name)
}

/** Desktop plugin id → the agent toolset carrying the same feature's
 *  agent-side tools. The Plugins page's Desktop switch toggles this app's UI
 *  panel; for these entries it also flips the toolset opt-in through the same
 *  `PUT /api/tools/toolsets/{name}` the Toolsets tab uses, so the panel is
 *  never UI-only (#96969). The kanban board is the built-in case: it has no
 *  agent-plugin package half, its agent tools live in the `kanban` toolset. */
export const DESKTOP_PLUGIN_TOOLSETS: Readonly<Record<string, string>> = {
  kanban: 'kanban'
}
