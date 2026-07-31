// Task 1.6.B2.1. Small, but it decides what happens when a stored section id
// no longer exists — and a blank settings pane reads as "settings don't open".

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  resolveSettingsSection,
  settingsSectionLabel
} from './settings-nav-pure'

describe('resolveSettingsSection', () => {
  it('keeps a section that exists', () => {
    expect(resolveSettingsSection('llm')).toBe('llm')
  })

  it('falls back to the default for an id that no longer exists', () => {
    expect(resolveSettingsSection('mcp-servers-from-a-future-release')).toBe(
      DEFAULT_SETTINGS_SECTION
    )
  })

  it('falls back for a missing id rather than rendering nothing', () => {
    expect(resolveSettingsSection(undefined)).toBe(DEFAULT_SETTINGS_SECTION)
    expect(resolveSettingsSection('')).toBe(DEFAULT_SETTINGS_SECTION)
  })
})

describe('SETTINGS_SECTIONS', () => {
  it('still opens on the two surfaces the popover held', () => {
    // Batch 2 appends sections; these two must keep leading, because the
    // screen replaced a popover that held exactly them and users look for
    // them where they were.
    expect(SETTINGS_SECTIONS.slice(0, 2).map((s) => s.id)).toEqual(['appearance', 'llm'])
  })

  it('has no duplicate ids', () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a Russian label for every section', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(settingsSectionLabel(section.id)).not.toBe('')
    }
  })

  it('the default is a real section', () => {
    expect(SETTINGS_SECTIONS.some((s) => s.id === DEFAULT_SETTINGS_SECTION)).toBe(true)
  })
})
