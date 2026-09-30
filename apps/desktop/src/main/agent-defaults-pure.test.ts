// Задача 3G.10 — список отложенных инструментов (UR42).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ensureSectionList } from './config-yaml-pure'
import {
  APPROVAL_DENY,
  CORE_DEFERRED_TOOLS,
  DEFERRED_TOOLS,
  DISABLED_SKILLS,
  KANBAN_TOOLS
} from './agent-defaults-pure'

const HERMES_SRC = join(__dirname, '..', '..', '..', '..', 'runtime', '.hermes-src')

describe('DEFERRED_TOOLS', () => {
  it('= их умолчание + 14 kanban_* + browser_exec + сейф', () => {
    expect(KANBAN_TOOLS).toHaveLength(14)
    expect(DEFERRED_TOOLS.slice(0, CORE_DEFERRED_TOOLS.length)).toEqual([...CORE_DEFERRED_TOOLS])
    expect(DEFERRED_TOOLS).toContain('browser_exec')
    expect(DEFERRED_TOOLS.filter((name) => name.startsWith('browser_vault_'))).toHaveLength(5)
    expect(new Set(DEFERRED_TOOLS).size).toBe(DEFERRED_TOOLS.length)
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
    const merged = ensureSectionList('approvals:\n  mode: manual\n', 'approvals', 'deny', APPROVAL_DENY)
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

