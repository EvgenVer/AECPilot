/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/onboarding-phase.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Where first-run onboarding is: `shown` while it runs, then how it ended. Funnel telemetry reads it. */
export type OnboardingPhase = 'done' | 'failed' | 'idle' | 'shown' | 'skipped'

export const $onboardingPhase = atom<OnboardingPhase>('idle')
