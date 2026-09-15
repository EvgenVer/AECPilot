/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/onboarding-chat/skip.tsx
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * The guided setup's escape hatch. Rides the composer's floating strip — the
 * same band the action badges and suggestion pills use — so it shares the
 * composer's edges instead of floating at an arbitrary offset. Skip assembles
 * the default layout, marks onboarding done, and drops the user in the full
 * app; the guided chat stays in the transcript. Visible from guide kickoff
 * until the layout pick assembles ($chatOnboardingSolo).
 */

import { useStore } from '@nanostores/react'

import { $chatOnboardingSolo, skipChatOnboarding } from '@/components/onboarding-chat/assembly'

export function OnboardingSkip() {
  const solo = useStore($chatOnboardingSolo)

  if (!solo) {
    return null
  }

  return (
    <button
      className="ml-auto text-[11px] text-(--ui-text-quaternary) transition-colors hover:text-(--ui-text-secondary)"
      onClick={skipChatOnboarding}
      type="button"
    >
      Skip setup
    </button>
  )
}
