/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/shared/src/catalog-install.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Install targets shared by the public docs galleries and native catalog. */
export interface SkillCatalogTarget {
  name: string
  source: string
  identifier?: string
  installIdentifier?: string
}

export function skillCatalogInstallIdentifier(skill: SkillCatalogTarget): string | null {
  if (skill.installIdentifier) {
    return skill.installIdentifier
  }

  const identifier = skill.identifier

  // Older snapshots omit identifiers for local skills. Optional skills have a
  // source-qualified name lookup; bundled skills are not in that source.
  if (!identifier) {
    return skill.source === 'built-in' ? null : skill.source === 'optional' ? `official/${skill.name}` : skill.name
  }

  return skill.source.toLowerCase() === 'clawhub' && !identifier.startsWith('clawhub/')
    ? `clawhub/${identifier}`
    : identifier
}

export function skillCatalogInstallUrl(skill: SkillCatalogTarget): string | null {
  const identifier = skillCatalogInstallIdentifier(skill)

  return identifier ? `hermes://skill/install?${new URLSearchParams({ identifier })}` : null
}

export function pluginCatalogInstallUrl(plugin: { name: string }): string {
  return `hermes://plugin/install?${new URLSearchParams({ catalog: plugin.name })}`
}
