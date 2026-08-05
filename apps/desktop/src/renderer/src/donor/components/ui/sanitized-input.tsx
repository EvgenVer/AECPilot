/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/sanitized-input.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
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
