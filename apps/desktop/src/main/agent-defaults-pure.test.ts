// Задача 3G.10 — список отложенных инструментов (UR42).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ensureNestedList,
  ensureNestedScalar,
  ensureSectionList,
  upgradeNestedList,
  upgradeSectionList
} from './config-yaml-pure'
import {
  APPROVAL_DENY,
  AUTO_LOAD_SKILLS,
  CORE_DEFERRED_TOOLS,
  CORE_OPT_OUTS,
  DEFERRED_TOOLS,
  DISABLED_SKILLS,
  KANBAN_TOOLS,
  PREVIOUS_AUTO_LOAD_SKILLS,
  PREVIOUS_DEFERRED_TOOLS
} from './agent-defaults-pure'

const HERMES_SRC = join(__dirname, '..', '..', '..', '..', 'runtime', '.hermes-src')
const REPO_SKILLS = join(__dirname, '..', '..', '..', '..', 'skills')

describe('DEFERRED_TOOLS', () => {
  it('= их умолчание + 15 kanban_* + browser_exec; сейф — один browser_vault из их списка', () => {
    expect(KANBAN_TOOLS).toHaveLength(15)
    expect(DEFERRED_TOOLS.slice(0, CORE_DEFERRED_TOOLS.length)).toEqual([...CORE_DEFERRED_TOOLS])
    expect(DEFERRED_TOOLS).toContain('browser_exec')
    expect(DEFERRED_TOOLS).toContain('browser_vault')
    expect(DEFERRED_TOOLS.filter((name) => name.startsWith('browser_vault_'))).toHaveLength(0)
    expect(new Set(DEFERRED_TOOLS).size).toBe(DEFERRED_TOOLS.length)
  })

  it('прежний список профиля (ядро 0.21.5) заменяется новым, свой список человека — нет', () => {
    const previous = PREVIOUS_DEFERRED_TOOLS[0]
    expect(previous).toHaveLength(37)
    const old = ensureNestedList('', 'tools', 'tool_search', 'defer', previous).text
    const upgraded = upgradeNestedList(
      old,
      'tools',
      'tool_search',
      'defer',
      PREVIOUS_DEFERRED_TOOLS,
      DEFERRED_TOOLS
    )
    expect(upgraded.changed).toBe(true)
    expect(upgraded.text).toBe(
      ensureNestedList('', 'tools', 'tool_search', 'defer', DEFERRED_TOOLS).text
    )

    const own = ensureNestedList('', 'tools', 'tool_search', 'defer', [
      ...previous,
      'web_search'
    ]).text
    expect(
      upgradeNestedList(
        own,
        'tools',
        'tool_search',
        'defer',
        PREVIOUS_DEFERRED_TOOLS,
        DEFERRED_TOOLS
      )
    ).toEqual({
      text: own,
      changed: false,
      unexpectedStructure: false
    })
  })

  it('замена не задевает соседние ключи секции', () => {
    const old = [
      'tools:',
      '  connectors:',
      '    enabled: false',
      '  tool_search:',
      '    enabled: auto',
      '    defer:',
      ...PREVIOUS_DEFERRED_TOOLS[0].map((name) => `      - ${name}`),
      '    max_results: 5',
      'skills:',
      '  disabled: []',
      ''
    ].join('\n')
    const { text, changed } = upgradeNestedList(
      old,
      'tools',
      'tool_search',
      'defer',
      PREVIOUS_DEFERRED_TOOLS,
      DEFERRED_TOOLS
    )
    expect(changed).toBe(true)
    expect(text).toContain('  connectors:\n    enabled: false\n')
    expect(text).toContain('    enabled: auto\n    defer:\n      - computer_use\n')
    expect(text).toContain('      - browser_exec\n    max_results: 5\nskills:\n')
    expect(text).not.toContain('apply_layout')
  })

  it('инструменты работы инженера остаются видимыми', () => {
    for (const name of ['execute_code', 'delegate_task', 'skill_manage', 'terminal', 'read_file']) {
      expect(DEFERRED_TOOLS).not.toContain(name)
    }
  })
})

describe('DISABLED_SKILLS (3G.11)', () => {
  it('выключает ~70 навыков, в том числе llm-wiki, без повторов', () => {
    expect(DISABLED_SKILLS.length).toBeGreaterThanOrEqual(65)
    expect(DISABLED_SKILLS).toContain('llm-wiki')
    expect(new Set(DISABLED_SKILLS).size).toBe(DISABLED_SKILLS.length)
  })

  it('инженерные и наши навыки остаются включёнными', () => {
    for (const name of [
      'hermes-agent',
      'docx',
      'xlsx',
      'pdf',
      'ocr-and-documents',
      'powerpoint',
      'grounded-citations',
      'maps',
      'computer-use',
      'aec-qa',
      'aec-wiki'
    ]) {
      expect(DISABLED_SKILLS).not.toContain(name)
    }
  })
})

// Копия их умолчания сверяется с установленным ядром: ключ заменяет список
// целиком, и расхождение молча вернуло бы их спрятанные инструменты в запрос.
describe('допущение о ядре ещё верно', () => {
  const defaults = join(HERMES_SRC, 'hermes_cli', 'config_defaults.py')
  const kanban = join(HERMES_SRC, 'tools', 'kanban_tools.py')

  it.skipIf(!existsSync(defaults))('их defer совпадает с нашей копией', () => {
    const text = readFileSync(defaults, 'utf-8')
    const block = /"defer":\s*\[([^\]]*)\]/.exec(text)
    expect(block, 'список defer найден').not.toBeNull()
    const names = [...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    expect(names).toEqual([...CORE_DEFERRED_TOOLS])
  })

  it.skipIf(!existsSync(kanban))('инструменты доски названы все', () => {
    const text = readFileSync(kanban, 'utf-8')
    const names = new Set([...text.matchAll(/"(kanban_[a-z_]+)"/g)].map((m) => m[1]))
    expect([...names].sort()).toEqual([...KANBAN_TOOLS])
  })
})

// D-165: запрет CLI ядра агенту ложится в их `approvals.deny`, рядом с режимом.
describe('APPROVAL_DENY', () => {
  it('пишется в секцию approvals рядом с режимом и не трогает свой список человека', () => {
    const merged = ensureSectionList(
      'approvals:\n  mode: manual\n',
      'approvals',
      'deny',
      APPROVAL_DENY
    )
    expect(merged.text).toBe(
      [
        'approvals:',
        '  deny:',
        '    - hermes.exe',
        "    - '*hermes.exe *'",
        `    - '*hermes.exe" *'`,
        "    - '*-m hermes_cli*'",
        '  mode: manual',
        ''
      ].join('\n')
    )
    const own = 'approvals:\n  mode: manual\n  deny:\n    - rm *\n'
    expect(ensureSectionList(own, 'approvals', 'deny', APPROVAL_DENY).changed).toBe(false)
  })
})

describe('умолчания ядра 0.22, закрытые в профиле (T20.5)', () => {
  it('ленивые установки, чужие логины, коннекторы, телеметрия, обновления плагинов и предел их загрузки', () => {
    const byPath = Object.fromEntries(CORE_OPT_OUTS.map((o) => [o.path.join('.'), o.value]))
    expect(byPath).toEqual({
      'security.allow_lazy_installs': false,
      'auth.adopt_external_logins': false,
      'tools.connectors.enabled': false,
      'telemetry.shared_metrics.enabled': false,
      'telemetry.shared_metrics.send': false,
      'plugins.auto_update_check_hours': 0,
      // T20.9: предел загрузки плагина выше импорта бэкенда Mem0 (~12,7 с)
      'plugins.load_timeout_seconds': 120,
      // T51 (ядро 0.23.0, решение 0016): самообновление плагинов, веб-приложение (HX33),
      // Daybreak (HX35) — закреплены, хотя у ядра уже выключены
      'plugins.auto_apply': false,
      'webapp.enabled': false,
      'agent.daybreak': false,
      // T53 (UR47): предел обмена между ботами — включён, 4 перехода
      'gateway.bot_loop_guard.enabled': true,
      'gateway.bot_loop_guard.max_hops': 4
    })
  })

  it('предел обмена ботов пишется в раздел gateway и не трогает значение человека (T53)', () => {
    let text = 'gateway:\n  trust_env: true\n'
    for (const { path, value } of CORE_OPT_OUTS.filter((o) => o.path[0] === 'gateway')) {
      text = ensureNestedScalar(text, path[0], path[1], path[2]!, value).text
    }
    expect(text).toContain('  trust_env: true\n')
    expect(text).toContain('  bot_loop_guard:\n')
    expect(text).toMatch(/ {4}enabled: true\n/)
    expect(text).toMatch(/ {4}max_hops: 4\n/)
    const mine = text.replace('max_hops: 4', 'max_hops: 2')
    expect(ensureNestedScalar(mine, 'gateway', 'bot_loop_guard', 'max_hops', 4).changed).toBe(false)
  })

  it('трёхуровневый ключ пишется рядом со списком defer и не трогает выбор человека', () => {
    let text = ensureNestedList('', 'tools', 'tool_search', 'defer', DEFERRED_TOOLS).text
    text = ensureNestedScalar(text, 'tools', 'connectors', 'enabled', false).text
    expect(text).toContain('  connectors:\n    enabled: false\n')
    const mine = text.replace('enabled: false', 'enabled: true')
    expect(ensureNestedScalar(mine, 'tools', 'connectors', 'enabled', false).changed).toBe(false)
  })

  it('aec-qa закреплён загруженным (UR5)', () => {
    expect(AUTO_LOAD_SKILLS).toContain('aec-qa')
    expect(DISABLED_SKILLS).not.toContain('aec-qa')
  })

  it('aec-revit закреплён загруженным, его навык лежит в skills/ (T70, UR51)', () => {
    expect(AUTO_LOAD_SKILLS).toEqual(['aec-qa', 'aec-revit'])
    expect(DISABLED_SKILLS).not.toContain('aec-revit')
    const skill = readFileSync(join(REPO_SKILLS, 'aec-revit', 'SKILL.md'), 'utf-8')
    expect(skill).toMatch(/^name: aec-revit$/m)
  })

  it('профиль с нашим прежним auto_load получает aec-revit, свой список человека — нет', () => {
    const ours = 'skills:\n  auto_load:\n    - aec-qa\n  disabled: []\n'
    const upgraded = upgradeSectionList(
      ours,
      'skills',
      'auto_load',
      PREVIOUS_AUTO_LOAD_SKILLS,
      AUTO_LOAD_SKILLS
    )
    expect(upgraded.text).toBe(
      'skills:\n  auto_load:\n    - aec-qa\n    - aec-revit\n  disabled: []\n'
    )
    const own = 'skills:\n  auto_load:\n    - aec-qa\n    - my-skill\n'
    expect(
      upgradeSectionList(own, 'skills', 'auto_load', PREVIOUS_AUTO_LOAD_SKILLS, AUTO_LOAD_SKILLS)
        .text
    ).toBe(own)
  })
})

describe('умолчания ядра для T20.5 ещё на месте', () => {
  const defaults = join(HERMES_SRC, 'hermes_cli', 'config_defaults.py')
  it.skipIf(!existsSync(defaults))('каждый закрываемый ключ есть в их умолчаниях', () => {
    const text = readFileSync(defaults, 'utf-8')
    for (const { path } of CORE_OPT_OUTS) {
      expect(text, path.join('.')).toContain(`"${path[path.length - 1]}"`)
    }
    expect(text).toContain('"auto_load": []')
  })
})
