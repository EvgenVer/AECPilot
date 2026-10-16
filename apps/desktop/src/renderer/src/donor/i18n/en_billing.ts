/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_billing.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
