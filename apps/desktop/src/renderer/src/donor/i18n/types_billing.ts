/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_billing.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Out-of-credits overlay copy; `Translations` spreads this in.
export interface BillingTranslations {
  billingBlock: {
    titleNous: string
    titleProvider: (provider: string) => string
    fallbackMessage: string
    openBilling: string
    addCredits: string
    dismiss: string
  }
}
