/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/setup-beat/card-type.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Setup cards read the chat's conversation tokens, so the setup chat's larger scale reaches them too.
// Relative sizes follow main's setup cards: label and detail one rung under the options, prose above.

/** The card's question line and section labels. */
export const CARD_LABEL_CLASS =
  'text-[length:var(--conversation-tool-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)'

/** Option names (pills, tiles, picker cards). */
export const CARD_OPTION_CLASS = 'text-[length:var(--conversation-caption-font-size)]'

/** The second line under an option name. */
export const CARD_DETAIL_CLASS = 'text-[length:var(--conversation-tool-font-size)]'

/** Chip draws its own fixed sizes; this restates both lines in the conversation tokens. */
export const CARD_CHIP_CLASS =
  'text-[length:var(--conversation-caption-font-size)] [&_.text-xs]:text-[length:var(--conversation-tool-font-size)]'

/** Continue and other card buttons. */
export const CARD_ACTION_CLASS =
  'h-auto text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height)'

/** A text box typed into like the composer. */
export const CARD_INPUT_CLASS = 'text-[length:var(--conversation-text-font-size)] leading-(--conversation-line-height)'
