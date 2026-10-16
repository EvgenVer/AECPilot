/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/zh_clarify.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ClarifyCopy } from './types_clarify'

export const zhClarify: Partial<ClarifyCopy> = {
  notReady: '澄清请求尚未就绪',
  gatewayDisconnected: 'Hermes 网关未连接',
  sendFailed: '无法发送澄清响应',
  loadingQuestion: '正在加载问题…',
  other: '其他 (输入你的答案)',
  placeholder: '输入你的答案…',
  skip: '跳过',
  skipped: '已跳过',
  noAnswer: '未回答',
  confirmAndContinueLabel: '确认并继续',
  singleSelectHint: '选一个',
  multiSelectHint: '可多选',
  oneQuestion: '1 个问题',
  questionProgress: (answered, total) => `已回答 ${answered}/${total}`,
  notDelivered: '此问题未送达应用，无法在此回答。请按停止结束本轮，然后在聊天中回复。'
}
