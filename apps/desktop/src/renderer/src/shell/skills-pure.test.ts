import { describe, expect, it } from 'vitest'
import {
  countSkills,
  describeCurator,
  describeDeleteConfirmation,
  describeReload,
  groupSkillsByCategory,
  isMemoryNodeId,
  SKILLS_EMPTY_HINT
} from './skills-pure'

describe('groupSkillsByCategory', () => {
  it('groups by category, both levels alphabetical', () => {
    const groups = groupSkillsByCategory([
      { name: 'zeta', category: 'writing' },
      { name: 'alpha', category: 'writing' },
      { name: 'beta', category: 'code' }
    ])
    expect(groups.map((group) => group.name)).toEqual(['code', 'writing'])
    expect(groups[1].skills.map((skill) => skill.name)).toEqual(['alpha', 'zeta'])
  })

  it('uses their own default category name for an uncategorised skill', () => {
    const groups = groupSkillsByCategory([{ name: 'x' }, { name: 'y', category: '  ' }])
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('general')
  })

  it('drops nameless rows rather than rendering blanks', () => {
    expect(groupSkillsByCategory([{ name: '' }, { name: 'ok' }])[0].skills).toHaveLength(1)
  })

  it('survives an empty or missing answer', () => {
    expect(groupSkillsByCategory([])).toEqual([])
    expect(groupSkillsByCategory(undefined)).toEqual([])
  })

  it('counts across groups', () => {
    const groups = groupSkillsByCategory([
      { name: 'a', category: 'x' },
      { name: 'b', category: 'y' },
      { name: 'c', category: 'y' }
    ])
    expect(countSkills(groups)).toBe(3)
  })
})

describe('isMemoryNodeId', () => {
  it('splits on the prefix their parse_node_kind uses', () => {
    expect(isMemoryNodeId('memory:AGENTS.md:3')).toBe(true)
    expect(isMemoryNodeId('sources-management')).toBe(false)
    expect(isMemoryNodeId('memories')).toBe(false)
  })
})

describe('describeDeleteConfirmation', () => {
  // Their own code makes these two different: a skill is archived and can be
  // restored, a memory chunk is cut out of the file.
  it('promises a restore path for a skill and names the command', () => {
    const text = describeDeleteConfirmation('sources-management')
    expect(text).toMatch(/архив/)
    expect(text).toContain('hermes curator restore sources-management')
  })

  it('says a memory node is gone for good', () => {
    expect(describeDeleteConfirmation('memory:AGENTS.md:1')).toMatch(/безвозвратно/)
  })

  it('never says both things at once', () => {
    expect(describeDeleteConfirmation('memory:x:0')).not.toMatch(/архив/)
    expect(describeDeleteConfirmation('skill-name')).not.toMatch(/безвозвратно/)
  })
})

describe('describeReload', () => {
  it('lists what changed', () => {
    expect(describeReload({ added: ['a'], removed: ['b'], total: 7 })).toBe(
      'добавлено: a; убрано: b · всего 7'
    )
  })

  // An unchanged list after pressing a button reads as a button that did
  // nothing, so "nothing changed" is said out loud.
  it('says so when nothing changed', () => {
    expect(describeReload({ added: [], removed: [], total: 3 })).toMatch(/не найдено/)
  })
})

describe('describeCurator', () => {
  it('states the unconditional fact even with no status at all', () => {
    const text = describeCurator(undefined)
    expect(text).toMatch(/автоархивации/)
    expect(text).toMatch(/вручную/)
  })

  it('adds the actual thresholds when the status arrived', () => {
    const text = describeCurator({
      enabled: true,
      paused: false,
      archive_after_days: 90,
      min_idle_hours: 12,
      last_run_at: '2026-07-01T10:00:00Z'
    })
    expect(text).toContain('90')
    expect(text).toContain('12')
    expect(text).toContain('2026-07-01T10:00:00Z')
  })

  it('says "never ran" rather than leaving the date blank', () => {
    expect(describeCurator({ enabled: true })).toMatch(/ни разу не запускался/)
  })

  it('reports paused and disabled as separate facts', () => {
    expect(describeCurator({ enabled: false })).toMatch(/выключен/)
    expect(describeCurator({ enabled: true, paused: true })).toMatch(/паузу/)
  })
})

describe('SKILLS_EMPTY_HINT', () => {
  it('explains where skills come from instead of just saying "empty"', () => {
    expect(SKILLS_EMPTY_HINT).toMatch(/SKILL\.md/)
  })
})
