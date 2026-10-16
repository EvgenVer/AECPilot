/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/version-label.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * The one short form every surface names a version by: `<release>+<distance>`
 * (`0.21.5+1913`), matching `hermes --version` minus its commit. The commit
 * (`.g<sha>`, `.dirty`) is build metadata the expanded version details show in
 * full; in a label it only adds noise. Callers own the `v` prefix, which the
 * localized copy already carries.
 */
export function shortVersion(version: string): string {
  return version.replace(/^v/, '').replace(/(\+\d+)\.g[0-9a-f]+(?:\.dirty)?$/i, '$1')
}
