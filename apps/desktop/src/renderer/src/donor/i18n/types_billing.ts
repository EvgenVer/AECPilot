/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_billing.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
