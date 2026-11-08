/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/onboarding-phase.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Where first-run onboarding is: `shown` while it runs, then how it ended. Funnel telemetry reads it. */
export type OnboardingPhase = 'done' | 'failed' | 'idle' | 'shown' | 'skipped'

export const $onboardingPhase = atom<OnboardingPhase>('idle')
