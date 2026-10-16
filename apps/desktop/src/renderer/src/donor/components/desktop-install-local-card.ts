/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/desktop-install-local-card.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Presentation for an install offer or an already-selected local runtime. */
export type LocalCardState = 'none' | 'installed' | 'bundled'

export interface LocalCardPresentation {
  /** i18n key into `t.install` for the card title. */
  title: 'installLocalTitle' | 'useLocalTitle'
  /** i18n key into `t.install` for the card body. */
  desc: 'installLocalDesc' | 'useLocalDesc' | 'bundledLocalDesc'
  /** Whether the "Will install to <root>" footer is accurate for this state. */
  showInstallTo: boolean
}

export function localCardPresentation(local: LocalCardState | undefined): LocalCardPresentation {
  switch (local) {
    case 'installed':
      return {
        title: 'useLocalTitle',
        desc: 'useLocalDesc',
        showInstallTo: false
      }

    case 'bundled':
      return {
        title: 'useLocalTitle',
        desc: 'bundledLocalDesc',
        showInstallTo: false
      }

    case 'none':

    default:
      return {
        title: 'installLocalTitle',
        desc: 'installLocalDesc',
        showInstallTo: true
      }
  }
}
