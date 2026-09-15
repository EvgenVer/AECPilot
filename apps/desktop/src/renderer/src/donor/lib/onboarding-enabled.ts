/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/onboarding-enabled.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** The preload launch flag is the only gate for guided onboarding. */
export function isOnboardingEnabled(): boolean {
  return window.hermesDesktop?.guestOnboardingEnabled === true
}
