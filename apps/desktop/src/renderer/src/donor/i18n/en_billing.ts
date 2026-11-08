/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_billing.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { BillingTranslations } from './types_billing'

// Out-of-credits overlay copy (Nous vs. third-party providers), spread into en.ts.
export const enBilling: BillingTranslations = {
  billingBlock: {
    titleNous: 'Out of Nous credits',
    titleProvider: provider => `Out of credits — ${provider}`,
    fallbackMessage: 'Your account is out of credits. Add credits to keep going.',
    openBilling: 'Open billing',
    addCredits: 'Add credits',
    dismiss: 'Dismiss'
  }
}
