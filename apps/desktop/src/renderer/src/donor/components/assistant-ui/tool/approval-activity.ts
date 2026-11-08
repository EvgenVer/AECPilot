/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/tool/approval-activity.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ToolCallLike } from './run-summary'

/** These calls render as activity, not file diffs or other deliverable cards. */
export const isApprovalActivity = (tool: ToolCallLike): boolean =>
  tool.toolName === 'terminal' || tool.toolName === 'execute_code'

export function isCurrentTurnMessage(messages: readonly { id: string; role: string }[], messageId: string): boolean {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]

    if (message.id === messageId) {
      return message.role === 'assistant'
    }

    if (message.role === 'user') {
      return false
    }
  }

  return false
}
