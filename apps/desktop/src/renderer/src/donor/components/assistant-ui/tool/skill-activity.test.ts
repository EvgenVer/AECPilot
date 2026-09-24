/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tool/skill-activity.test.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { describe, expect, it } from 'vitest'

import { summarizeToolRun } from './run-summary'

const skill = { type: 'tool-call' as const, toolName: 'skill_view', args: { name: 'research-notes' } }

describe('skill activity identity', () => {
  it('keeps each skill identity and failed outcome in mixed collapsed summaries', () => {
    const summary = summarizeToolRun(
      [
        { ...skill, result: 'instructions' },
        { ...skill, args: { name: 'second-skill' }, result: { error: 'not found' } },
        { toolName: 'terminal', args: { command: 'echo ok' }, result: { stdout: 'ok' } }
      ],
      false
    )

    expect(summary).toContain('Loaded skill: research-notes')
    expect(summary).toContain('failed to load skill: second-skill')
    expect(summary).toContain('ran 1 command')
    expect(summary).toContain('1 tool call failed')
  })
})
