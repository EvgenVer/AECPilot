// Task T70 (UR51, decision 0020): the Revit write rule, end to end on the core's own MCP
// client — no model, no Revit, no network. `revit-mcp-probe.mjs` runs the core against the
// stand-in server `fixtures/revit-mcp-stub.py` in a temporary profile made here: the skills
// block the app writes (`skills.external_dirs` → our `skills/`, `skills.auto_load`) and
// nothing else.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { AUTO_LOAD_SKILLS } from '../apps/desktop/src/main/agent-defaults-pure'
import { PYTHON_BIN, RUNTIME_DIR } from './hermes-env.mjs'

const SKILLS_DIR = path.join(RUNTIME_DIR, '..', 'skills')
const ready = fs.existsSync(PYTHON_BIN) && fs.existsSync(path.join(RUNTIME_DIR, '.hermes-src'))

describe('Revit MCP through the core (T70)', () => {
  it.skipIf(!ready)(
    'reads freely, untrusted writes ask, a window-written server leaves the rule to the agent',
    () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-t70-'))
      try {
        const config = [
          'skills:',
          '  external_dirs:',
          `    - ${JSON.stringify(SKILLS_DIR)}`,
          '  auto_load:',
          ...AUTO_LOAD_SKILLS.map((name) => `    - ${name}`),
          ''
        ].join('\n')
        fs.writeFileSync(path.join(home, 'config.yaml'), config, 'utf-8')

        const run = spawnSync(process.execPath, [path.join(RUNTIME_DIR, 'revit-mcp-probe.mjs')], {
          encoding: 'utf-8',
          env: { ...process.env, AEC_HERMES_HOME: home },
          timeout: 240_000,
          windowsHide: true
        })
        const result = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')))

        expect(result.checks).toEqual({
          reads_answer_without_question: true,
          write_asks_with_element_and_value: true,
          deny_leaves_model_unchanged: true,
          accept_changes_model: true,
          delete_asks: true,
          plain_server_writes_without_program_question: true,
          write_rule_skill_pinned: true
        })
        expect(run.status).toBe(0)
      } finally {
        fs.rmSync(home, { recursive: true, force: true })
      }
    },
    300_000
  )
})
