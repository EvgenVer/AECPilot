/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tool/skill-activity.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { translateNow } from '@/i18n'
import { firstStringField } from '@/lib/text'

import { parseMaybeObject, toolCallFailed } from './fallback-model/format'

interface SkillCall {
  args?: unknown
  completedAt?: number
  isError?: boolean
  result?: unknown
  toolName: string
}

/** Loading instructions is not the same action as reading a skill resource,
 * and neither proves the task described by the skill has been completed. */
export function skillActivityTitle(part: SkillCall, live = true): string | undefined {
  if (part.toolName !== 'skill_view' && part.toolName !== 'skills_list') {
    return undefined
  }

  const args = parseMaybeObject(part.args)
  const failed = toolCallFailed(part)
  const pending = live && part.result === undefined && part.completedAt === undefined
  const missing = !pending && part.result === undefined
  const file = firstStringField(args, ['file_path'])
  const name = firstStringField(args, ['name'])
  const target = [name, file].filter(Boolean).join(' → ')

  const keys =
    part.toolName === 'skills_list'
      ? { pending: 'listing', done: 'listed', failed: 'listFailed' }
      : file
        ? { pending: 'readingResource', done: 'readResource', failed: 'resourceFailed' }
        : { pending: 'loading', done: 'loaded', failed: 'loadFailed' }

  const key = failed ? keys.failed : missing ? 'unavailable' : pending ? keys.pending : keys.done
  const label = translateNow(`assistant.tool.skillActivity.${key}`)

  return target ? `${label}: ${target}` : label
}
