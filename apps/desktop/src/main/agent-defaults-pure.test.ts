// Задача 3G.10 — список отложенных инструментов (UR42).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ensureNestedList,
  ensureNestedScalar,
  ensureSectionList,
  upgradeNestedList
} from './config-yaml-pure'
import {
  APPROVAL_DENY,
  AUTO_LOAD_SKILLS,
  CORE_DEFERRED_TOOLS,
  CORE_OPT_OUTS,
  DEFERRED_TOOLS,
  DISABLED_SKILLS,
  KANBAN_TOOLS,
  PREVIOUS_DEFERRED_TOOLS
} from './agent-defaults-pure'

const HERMES_SRC = join(__dirname, '..', '..', '..', '..', 'runtime', '.hermes-src')

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
      'plugins.load_timeout_seconds': 120
    })
  })

  it('трёхуровневый ключ пишется рядом со списком defer и не трогает выбор человека', () => {
    let text = ensureNestedList('', 'tools', 'tool_search', 'defer', DEFERRED_TOOLS).text
    text = ensureNestedScalar(text, 'tools', 'connectors', 'enabled', false).text
    expect(text).toContain('  connectors:\n    enabled: false\n')
    const mine = text.replace('enabled: false', 'enabled: true')
    expect(ensureNestedScalar(mine, 'tools', 'connectors', 'enabled', false).changed).toBe(false)
  })

  it('aec-qa закреплён загруженным (UR5)', () => {
    expect(AUTO_LOAD_SKILLS).toEqual(['aec-qa'])
    expect(DISABLED_SKILLS).not.toContain('aec-qa')
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
