/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/chat-messages/index.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export { sameAttachmentTurn } from './attachment-turn'
export { toChatMessages } from './hydration'
export {
  appendAssistantTextPart,
  appendReasoningPart,
  assistantTextPart,
  chatMessageText,
  collectUnspokenTurnSpeech,
  completeOpenTimelineParts,
  dedupeRepeatedTextInParts,
  finalizeInterruptedMessages,
  lastTextPartText,
  mergeFinalAssistantText,
  normalizeWs,
  partsText,
  reasoningPart,
  reasoningTextFromDetails,
  renderMediaTags,
  textPart
} from './parts'
export type { UnspokenTurnSpeech } from './parts'
export {
  branchGroupForUser,
  isLocalSystemNotice,
  preserveLocalAssistantErrors,
  preserveLocalSystemNotices,
  spliceOlderPreservedRows
} from './reconciliation'
export {
  concatPartsByToolCall,
  hasUnresolvedToolCall,
  isRedeliveredToolEvent,
  markQueuedPromptStarted,
  QUESTION_CARD_TOOLS,
  queuedPromptAwaitsNextTurn,
  restorePendingBlockingToolCall,
  restorePendingClarifyToolCall,
  sealOpenToolParts,
  settlePendingClarifyToolCall,
  stripPendingClarifyProjectionForCache,
  toolCallOwnerMessageId,
  toolEventOwnerMessageId,
  upsertToolPart,
  withUniqueToolCallIdsWithinMessage
} from './tool-parts'
export type { PendingClarifyProjection, SettledClarifyProjection } from './tool-parts'
export type { ChatMessage, ChatMessagePart, GatewayEventPayload, TimelinePartMetadata } from './types'
