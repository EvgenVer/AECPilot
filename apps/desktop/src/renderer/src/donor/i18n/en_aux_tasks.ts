/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_aux_tasks.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { AuxTaskCopyMap } from './types_aux_tasks'

export const enAuxTasks: AuxTaskCopyMap = {
  vision: { label: 'Vision', hint: 'Image analysis' },
  compression: { label: 'Compression', hint: 'Context compaction' },
  approval: { label: 'Approval', hint: 'Smart auto-approve' },
  mcp: { label: 'MCP', hint: 'MCP tool routing' },
  title_generation: { label: 'Title gen', hint: 'Session titles' },
  review: { label: 'Review', hint: '/review reviewer subagent' },
  voice_chat: { label: 'Voice chat', hint: 'Spoken voice-mode replies' },
  triage_specifier: { label: 'Triage specifier', hint: 'Kanban spec fleshing' },
  kanban_decomposer: { label: 'Kanban decomposer', hint: 'Task decomposition' },
  profile_describer: { label: 'Profile describer', hint: 'Auto profile descriptions' },
  curator: { label: 'Curator', hint: 'Skill-usage review' }
}
