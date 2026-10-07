// Our surfaces enter their shell the way any contribution does — through their
// registry, not by editing their layout. That is the whole reason PLAN keeps
// their contribution system while dropping their plugin LOADER (HX5): the
// architecture is useful, third-party code on disk is not.
//
// Importing this module registers the pane; `main.tsx` does that once.

import { revealTreePane } from '../../donor/components/pane-shell/tree/store'
import { registry } from '../../donor/contrib/registry'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { IndexStatus } from '../index-status/IndexStatus'
import { DocumentViewer } from '../viewers/DocumentViewer'
import { setAfterOpenDocument } from '../viewers/viewer-store'
import { ProjectMenu } from '../project/ProjectMenu'

import { VaultExplorer } from './VaultExplorer'

// The pane title is read by their chrome outside React, so it cannot use the
// hook — `translatePlugin` is their own non-reactive translator for exactly
// this case. A language switch retitles it on the next registry mutation.
const title = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'explorer.title', [])

const viewerTitle = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'viewer.title', [])

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

// The index indicator sits next to the project menu: «what am I working on»
// and «has it been read» are the two things that decide whether an answer can
// be trusted, and both belong where they are always visible.
registry.register({
  id: 'aec-index-status',
  area: STATUSBAR_AREAS.left,
  source: 'core',
  order: -98,
  render: () => <IndexStatus />
})

// Checkpoints used to be registered here as a pane of our own. Task 3.3 moved
// them onto THEIR pane id (`review`), so ⌘G, the palette toggle and the
// transcript's "N files changed" card all open the change history instead of
// the git surface SPEC excludes (HX6) — see
// `aec/rollback/register-changes-pane.tsx`. One panel, one place.

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

// The document viewer sits on the right, next to checkpoints: both answer
// «show me the thing itself» about something that just appeared in the chat.
// It is what a citation opens (task 2.14) — the click that closes the loop
// between an answer and the page it came from (SPEC UR3, AC1).
registry.register({
  id: 'aec-viewer',
  area: 'panes',
  source: 'core',
  title: viewerTitle(),
  data: {
    placement: 'right',
    collapsible: true,
    width: '460px',
    minWidth: '320px',
    maxWidth: '900px'
  },
  render: () => <DocumentViewer />
})

// Opening a document is intent to SEE it. The right column starts collapsed,
// and until task 3F.3 (D-91) a click in the tree or on a citation put the
// document into a pane nobody could see. Their `revealTreePane` is the same
// door their own preview tiles and ⌘G use: un-collapse the side, unhide the
// tab, bring it to the front.
setAfterOpenDocument(() => revealTreePane('aec-viewer'))
