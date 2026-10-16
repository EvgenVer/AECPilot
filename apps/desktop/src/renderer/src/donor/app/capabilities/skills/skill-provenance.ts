/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/skills/skill-provenance.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { SkillInfo } from '@/types/hermes'

/**
 * #108032: an external mount is not a managed hub/bundled source — it is the user's
 * own directory pointed at via skills.external_dirs. Origin only, never mutability:
 * external skills stay editable in place (a refusal would just breed silent local
 * duplicates — commit 8c8fc6c1ec / PR #17512).
 */

export function catalogSourceFor(provenance: SkillInfo['provenance']): 'built-in' | 'hub' | 'external' | 'local' {
  if (provenance === 'bundled') {
    return 'built-in'
  }

  if (provenance === 'hub') {
    return 'hub'
  }

  if (provenance === 'external') {
    return 'external'
  }

  return 'local'
}

export function isEditableProvenance(provenance: SkillInfo['provenance']): boolean {
  // Only learned/local skills are the user's to rewrite or archive — bundled and
  // hub skills are managed by their sources. External mounts stay editable in
  // place (the user pointed skills.external_dirs at them).
  return provenance === 'agent' || provenance === 'external'
}
