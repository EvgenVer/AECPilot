// Our surfaces enter their shell the way any contribution does — through their
// registry, not by editing their layout. That is the whole reason PLAN keeps
// their contribution system while dropping their plugin LOADER (HX5): the
// architecture is useful, third-party code on disk is not.
//
// Importing this module registers the pane; `main.tsx` does that once.

import { registry } from '../../donor/contrib/registry'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { ProjectMenu } from '../project/ProjectMenu'
import { RollbackPanel } from '../rollback/RollbackPanel'
import { ScanWatcher } from '../scan/ScanWatcher'

import { VaultExplorer } from './VaultExplorer'

// The pane title is read by their chrome outside React, so it cannot use the
// hook — `translatePlugin` is their own non-reactive translator for exactly
// this case. A language switch retitles it on the next registry mutation.
const title = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'explorer.title', [])

const rollbackTitle = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'rollback.title', [])

// The project menu goes in their status bar, left side: "what am I working on"
// has to be readable without opening anything (every file operation, scan and
// agent turn is scoped to that vault).
registry.register({
  id: 'aec-project',
  area: STATUSBAR_AREAS.left,
  source: 'core',
  order: -100,
  render: () => <ProjectMenu />
})

// Renders nothing — a subscription that turns our scan reports into one of
// their notifications. Mounted through the registry so it lives exactly as long
// as the shell does.
registry.register({
  id: 'aec-scan-watcher',
  area: STATUSBAR_AREAS.left,
  source: 'core',
  order: -99,
  render: () => <ScanWatcher />
})

// Checkpoints go on the right, where their own review-ish panes live. The
// donor's git surface is excluded (HX6), so this is the only answer to "what
// did the agent change in my files, and how do I undo it".
registry.register({
  id: 'aec-rollback',
  area: 'panes',
  source: 'core',
  title: rollbackTitle(),
  data: {
    placement: 'right',
    collapsible: true,
    width: '320px',
    minWidth: '260px',
    maxWidth: '560px'
  },
  render: () => <RollbackPanel />
})

registry.register({
  id: 'aec-explorer',
  area: 'panes',
  source: 'core',
  title: title(),
  data: {
    placement: 'left',
    collapsible: true,
    width: '260px',
    minWidth: '200px',
    maxWidth: '480px'
  },
  render: () => <VaultExplorer />
})
