/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_notices.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Shell notice strings: the remote-display toast, the butterbar and the keep-awake offer; `Translations`
// spreads this in.
export interface NoticeTranslations {
  remoteDisplayBanner: {
    message: (reason: string) => string
  }

  butterbar: {
    goTo: (index: number, total: number) => string
    legal: { before: string; terms: string; between: string; privacy: string; after: string }
  }

  /** Once per computer, after a timed sleep interrupted a turn with keep-awake off. */
  keepAwakeOffer: { title: string; message: string; action: string }
}
