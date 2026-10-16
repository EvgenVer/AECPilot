/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/clarify/submit-shortcut.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { KeyboardEvent } from 'react'

/** Use the form's enabled submit button so validation and pending state agree. */
export function handleClarifySubmitShortcut(event: KeyboardEvent<HTMLFormElement>): void {
  if (
    event.key !== 'Enter' ||
    !(event.metaKey || event.ctrlKey) ||
    event.altKey ||
    event.shiftKey ||
    event.nativeEvent.isComposing ||
    event.defaultPrevented
  ) {
    return
  }

  // Capture before a focused choice toggles or a textarea handles plain Enter.
  event.preventDefault()
  event.stopPropagation()

  const submit = event.currentTarget.querySelector<HTMLButtonElement>('button[type="submit"]')

  if (submit && !submit.disabled && !event.repeat) {
    event.currentTarget.requestSubmit(submit)
  }
}
