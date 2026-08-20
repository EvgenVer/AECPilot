// The takeover in `register-changes-pane.tsx` rests on one property of their
// registry: registering the same id twice REPLACES rather than appends
// (`put()`, donor/contrib/registry.ts). If that ever changes upstream, ⌘G and
// the transcript's "N files changed" card would silently go back to opening
// their git review pane — a surface SPEC excludes (HX6) and which, in a vault
// that is not a repository, can only say "not a repository".

import { describe, expect, it } from 'vitest'

import { registry } from '../../donor/contrib/registry'

import { registerChangesPane } from './register-changes-pane'

const reviewPanes = () => registry.getArea('panes').filter((c) => c.id === 'review')

describe('changes pane (task 3.3)', () => {
  it('takes the place of a pane already registered under their id', () => {
    const theirs = {
      id: 'review',
      area: 'panes',
      source: 'core' as const,
      title: 'review',
      render: () => null
    }

    registry.register(theirs)
    expect(reviewPanes()).toHaveLength(1)

    registerChangesPane()

    const panes = reviewPanes()
    expect(panes).toHaveLength(1)
    expect(panes[0]).not.toBe(theirs)
    // Their body is gone, and the pane no longer calls itself "review".
    expect(panes[0].render).not.toBe(theirs.render)
    expect(panes[0].title).not.toBe('review')
  })

  it('keeps their pane id, because every door is addressed to it', () => {
    registerChangesPane()

    // ⌘G (`bindPaneVisibility('review', …)`), the palette toggle,
    // `revealTreePane(REVIEW_PANE_ID)` and the changed-files card all name it.
    expect(reviewPanes()).toHaveLength(1)
    expect(reviewPanes()[0].area).toBe('panes')
  })
})
