/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ja_aux_tasks.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { AuxTaskCopyMap } from './types_aux_tasks'

export const jaAuxTasks: AuxTaskCopyMap = {
  vision: { label: 'ビジョン', hint: '画像分析' },
  compression: { label: '圧縮', hint: 'コンテキストの圧縮' },
  approval: { label: '承認', hint: 'スマート自動承認' },
  mcp: { label: 'MCP', hint: 'MCP ツールルーティング' },
  title_generation: { label: 'タイトル生成', hint: 'セッションタイトル' },
  review: { label: 'レビュー', hint: '/review レビューサブエージェント' },
  voice_chat: { label: '音声チャット', hint: '音声モードの応答' },
  triage_specifier: { label: 'トリアージ指定', hint: 'カンバン仕様の具体化' },
  kanban_decomposer: { label: 'カンバン分解', hint: 'タスク分解' },
  profile_describer: { label: 'プロファイル記述', hint: 'プロファイル概要の自動生成' },
  curator: { label: 'キュレーター', hint: 'スキル使用レビュー' }
}
