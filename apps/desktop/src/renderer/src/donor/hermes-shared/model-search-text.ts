/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/shared/src/model-search-text.ts
 * Commit:  345cd2b057a452236de401d3534b8502a7465e8d (v2026.9.14)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Extra tokens used only for model-picker search ranking.
 *
 * Wire IDs stay unchanged — some providers report short or brand-less ids
 * (Kimi Coding's flagship is literally `k3`) that users still search for by
 * the familiar `kimi-…` naming of sibling models.
 *
 * Keep in sync with the Python twin, hermes_cli/model_search.py.
 */
const MODEL_SEARCH_ALIASES: Record<string, readonly string[]> = {
  k3: ['kimi-k3', 'kimi'],
  // OpenCode Zen serves the "Ox Alpha" stealth model under an opaque
  // preview slug; let users find it by its public codename.
  'x-preview-f-free': ['ox-alpha', 'ox']
}

/** Haystack for fuzzy/substring model search; never changes the wire id. */
export function modelSearchText(model: string): string {
  const id = model.trim()

  if (!id) {
    return model
  }

  const aliases = MODEL_SEARCH_ALIASES[id.toLowerCase()]

  if (!aliases?.length) {
    return id
  }

  return `${id} ${aliases.join(' ')}`
}
