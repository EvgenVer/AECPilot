// «Изменения в документах» takes over their review pane (task 3.3, SPEC UR16).
//
// WHY A TAKEOVER AND NOT A PANE OF OUR OWN. Their review pane is addressed from
// four places we keep and want: ⌘G (`view.toggleReview`), the command palette
// toggle, the composer's coding row, and the transcript's "N files changed →
// Review changes" card — every one of them names the pane id `review`
// (`REVIEW_PANE_ID`, `bindPaneVisibility('review', …)`, `revealTreePane`).
// Registering OUR body under that id keeps all four doors and replaces what is
// behind them; a second pane with a new id would have left those doors opening
// onto a git surface SPEC excludes (HX6).
//
// Their registry makes this a supported move rather than a hack: `put()` drops
// any entry with the same id before appending the new one, so the last
// registration of `review` wins. That is why this is a FUNCTION called from
// `main.tsx`'s body instead of an import side effect — module bodies run after
// every static import has been evaluated, so we cannot lose the race to their
// controller no matter how the import block is later sorted.
//
// WHAT IS BEHIND THE DOOR. `RollbackPanel` — the checkpoint list, the
// line-by-line difference and the way back (UR14, task 1.6.C2). It answers the
// same question their pane answers ("what changed in my files, and how do I
// undo it") from the only source that exists here: the core's shadow snapshot
// store. Their pane reads the working tree's git, and this vault is
// deliberately not a repository (PLAN §«Проектные скилы»), so with
// `hermesDesktop.git` declared absent (SPEC HX6, `hermes-desktop-shim.ts`)
// their body can only ever say "not a repository".

import { registry } from '../../donor/contrib/registry'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { RollbackPanel } from './RollbackPanel'

/** Their pane id — the address every entry point above already uses. */
const REVIEW_PANE_ID = 'review'

const changesTitle = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'rollback.title', [])

/** Registers the pane. Call from `main.tsx`, after their shell module has been
 *  imported — see the header for why the timing is deliberate. */
export function registerChangesPane(): void {
  registry.register({
    id: REVIEW_PANE_ID,
    area: 'panes',
    source: 'core',
    title: changesTitle(),
    // Sizing and placement stay theirs: the pane keeps its slot in the right
    // column, hidden until asked for, so the layouts that already place
    // `review` (their presets, a persisted tree) keep working.
    data: {
      placement: 'right',
      collapsible: true,
      revealAliases: [REVIEW_PANE_ID],
      width: '320px',
      minWidth: '260px',
      maxWidth: '560px'
    },
    render: () => <RollbackPanel />
  })
}
