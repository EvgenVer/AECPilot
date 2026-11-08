/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/sanitized-input.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type * as React from 'react'

import { Input } from './input'

interface SanitizedInputProps extends Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> {
  value: string
  onValueChange: (value: string) => void
  // A formatter from `@/lib/sanitize` (gitRef, slug, …) run on every keystroke.
  sanitize: (raw: string) => string
}

// An <Input> that can only ever hold a valid value: every keystroke is run
// through `sanitize`, so callers never have to validate-then-reject (a space in
// a branch name becomes "-" as you type instead of erroring at submit).
export function SanitizedInput({ value, onValueChange, sanitize, ...props }: SanitizedInputProps) {
  return <Input {...props} onChange={event => onValueChange(sanitize(event.target.value))} value={value} />
}
