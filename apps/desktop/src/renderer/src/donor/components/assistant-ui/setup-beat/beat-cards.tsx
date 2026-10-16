/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/setup-beat/beat-cards.tsx
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { BeatOption } from '@/store/setup-beat'

import { CARD_ACTION_CLASS, CARD_CHIP_CLASS, CARD_INPUT_CLASS } from './card-type'

/** A text box for the name. The OS account's full name is offered as a row and is sent only when picked. */
export function NameCard({ onName, suggested }: { onName: (name: string) => void; suggested?: string }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const typed = name.trim()

  return (
    <div className="grid gap-2">
      {suggested && (
        <Chip
          className={CARD_CHIP_CLASS}
          label={t.firstRun.useName(suggested)}
          on={false}
          onToggle={() => onName(suggested)}
          variant="pill"
        />
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={event => {
          event.preventDefault()

          if (typed) {
            onName(typed)
          }
        }}
      >
        <Input
          aria-label={t.firstRun.namePlaceholder}
          className={cn('flex-1', CARD_INPUT_CLASS)}
          onChange={event => setName(event.target.value)}
          placeholder={t.firstRun.namePlaceholder}
          value={name}
        />
        <Button className={CARD_ACTION_CLASS} disabled={!typed} size="sm" type="submit">
          {t.common.continue}
        </Button>
      </form>
    </div>
  )
}

/** The backend's options for tour and build, one pill each; a click is the pick. */
export function OptionsCard({ onPick, options }: { onPick: (option: BeatOption) => void; options: BeatOption[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map(option => (
        <Chip
          className={CARD_CHIP_CLASS}
          key={option.id}
          label={option.label}
          on={false}
          onToggle={() => onPick(option)}
          variant="pill"
        />
      ))}
    </div>
  )
}
