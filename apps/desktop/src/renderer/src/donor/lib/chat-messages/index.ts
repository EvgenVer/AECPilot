/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/chat-messages/index.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export { toChatMessages } from './hydration'
export {
  appendAssistantTextPart,
  appendReasoningPart,
  assistantTextPart,
  chatMessageText,
  collectUnspokenTurnSpeech,
  completeOpenTimelineParts,
  dedupeRepeatedTextInParts,
  mergeFinalAssistantText,
  reasoningPart,
  renderMediaTags,
  textPart
} from './parts'
export type { UnspokenTurnSpeech } from './parts'
export { branchGroupForUser, preserveLocalAssistantErrors } from './reconciliation'
export { sealOpenToolParts, upsertToolPart } from './tool-parts'
export type { ChatMessage, ChatMessagePart, GatewayEventPayload, TimelinePartMetadata } from './types'
