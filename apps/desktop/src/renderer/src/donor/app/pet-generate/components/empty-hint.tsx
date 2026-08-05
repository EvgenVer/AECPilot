/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/pet-generate/components/empty-hint.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Button } from '@/components/ui/button'

interface EmptyHintProps {
  onExample: (prompt: string) => void
}

// Creative seed prompts — specifics make better pets (petdex's own advice).
// Short chips that wrap into a tight, centered cluster (capped width → 2 rows).
const EXAMPLE_PROMPTS = ['bubble-tea otter', 'sock elf', 'pixel dragon', 'office cat', 'neon axolotl', 'moss golem']

export function EmptyHint({ onExample }: EmptyHintProps) {
  return (
    <div className="flex max-w-[300px] flex-wrap place-content-center place-items-center gap-2">
      {EXAMPLE_PROMPTS.map(example => (
        <Button
          className="h-auto w-fit rounded-full font-normal"
          key={example}
          onClick={() => onExample(`a ${example}`)}
          size="xs"
          variant="outline"
        >
          {example}
        </Button>
      ))}
    </div>
  )
}
