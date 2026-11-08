/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/localized-tab-title.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ReactNode } from 'react'

import { useI18n } from './context'
import type { Translations } from './types'

/** Render-time pane TAB label for panes registered outside React.
 *
 *  A contribution's `title` is a plain string sampled once, at `register`.
 *  Bundled panes (the Sessions sidebar, Bot Mode's roster) register during
 *  module import — BEFORE `I18nProvider` has fetched `display.language` from
 *  the backend — so a `translateNow(...)` there resolves English and the strip
 *  keeps reading SESSIONS / BOTS on a Russian install. Hand this to
 *  `data.tabTitle` instead: it subscribes to the live locale like any component
 *  and re-renders the tab when the language loads or the user switches it.
 *  `title` stays as the string fallback for the non-React readers. */
export function LocalizedTabTitle({ select }: { select: (t: Translations) => ReactNode }) {
  const { t } = useI18n()

  return <>{select(t)}</>
}
