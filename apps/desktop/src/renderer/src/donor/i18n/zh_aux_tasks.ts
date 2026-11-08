/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/zh_aux_tasks.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { AuxTaskCopyMap } from './types_aux_tasks'

export const zhAuxTasks: AuxTaskCopyMap = {
  vision: { label: '视觉', hint: '图片分析' },
  compression: { label: '压缩', hint: '上下文压缩' },
  approval: { label: '审批', hint: '智能自动批准' },
  mcp: { label: 'MCP', hint: 'MCP 工具路由' },
  title_generation: { label: '标题生成', hint: '会话标题' },
  review: { label: '评审', hint: '/review 评审子智能体' },
  voice_chat: { label: '语音聊天', hint: '语音模式回复' },
  triage_specifier: { label: '分类指定', hint: '看板任务规格补全' },
  kanban_decomposer: { label: '看板分解', hint: '任务拆解' },
  profile_describer: { label: '配置描述', hint: '自动生成配置描述' },
  curator: { label: '维护器', hint: '技能使用审查' }
}
