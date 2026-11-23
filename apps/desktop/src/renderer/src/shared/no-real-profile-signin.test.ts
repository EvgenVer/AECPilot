// The in-app browser never signs in with the person's real browser profile (SPEC HX36,
// owner decision 2026-11-23, task T89). With `browser.use_real_profile` the core and the
// donor window copy the person's cookies (mail, bank, work services) into the preview
// browser, so a page the agent opens would act on their behalf.
//
// The donor (0.23.3) offers it in three places: a toggle on the Browser tool page, a
// consent dialog on the first preview tab and a raw field in Settings → Config. All
// three are removed by edit [3]; the launch-time sync hook is not mounted. The main
// process has no bridge for it either (`donor-members.test.ts`, UNBRIDGED (13)), so a
// vendored file that brings the switch back would show a control that silently does
// nothing — this test makes that visible at the next donor re-copy.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { configSubpageForField } from '../donor/app/settings/config-subpages'
import { SECTIONS } from '../donor/app/settings/constants'

const DONOR = join(__dirname, '..', 'donor')

/** Comments are dropped: the edit markers name the excluded piece on purpose. */
function code(rel: string): string {
  return readFileSync(join(DONOR, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
}

describe('no real-profile sign-in in the preview browser (SPEC HX36)', () => {
  it('the toggle, the consent dialog and the launch sync are not mounted', () => {
    expect(code('app/capabilities/toolsets/toolset-detail.tsx')).not.toMatch(
      /BrowserRealProfilePanel/
    )
    expect(code('app/chat/right-rail/preview-pane.tsx')).not.toMatch(/RealProfileConsentDialog/)
    expect(code('app/contrib/wiring.tsx')).not.toMatch(/PreviewSigninsBoot/)
  })

  it('the modules that only served it are not vendored', () => {
    for (const rel of [
      'app/settings/browser-real-profile-panel.tsx',
      'app/chat/right-rail/real-profile-consent-dialog.tsx',
      'app/contrib/hooks/use-preview-signins-boot.ts',
      'lib/preview-signins.ts',
      'store/real-profile-consent.ts'
    ]) {
      expect(existsSync(join(DONOR, rel)), rel).toBe(false)
    }
  })

  it('Settings does not list `browser.use_real_profile`', () => {
    const sectionKeys = SECTIONS.flatMap((section) => section.keys)
    expect(sectionKeys).not.toContain('browser.use_real_profile')
    expect(configSubpageForField('browser', 'browser.use_real_profile')).toBeUndefined()
  })
})
