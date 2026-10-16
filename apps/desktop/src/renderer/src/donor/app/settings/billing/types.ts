/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/billing/types.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type {
  BillingAutoReload,
  BillingCardInfo,
  BillingChargeResponse,
  BillingChargeStatusResponse,
  BillingErrorPayload,
  BillingMonthlyCap,
  BillingMutationResponse,
  BillingRefusalCode,
  ChargeFailureReason,
  BillingStateResponse as SharedBillingStateResponse,
  SubscriptionPreviewResponse,
  SubscriptionStateResponse,
  SubscriptionTierOption,
  UsageBarData,
  UsageModelData
} from '@hermes/shared/billing'

/**
 * The gateway's `billing.state` payload as THIS app reads it: the shared shape
 * plus the free-tier fields newer gateways add. When `free_tier_account` is true there
 * is no account behind the call — `logged_in` is false and there is no balance,
 * card or usage — so the free-tier branch must be read before the logged-out
 * one. Both fields are absent on older gateways.
 */
export type BillingStateResponse = SharedBillingStateResponse & {
  free_tier_account?: boolean
  free_tier_model?: null | string
}

export type {
  BillingAutoReload,
  BillingCardInfo,
  BillingChargeResponse,
  BillingChargeStatusResponse,
  BillingErrorPayload,
  BillingMonthlyCap,
  BillingMutationResponse,
  BillingRefusalCode,
  ChargeFailureReason,
  SharedBillingStateResponse,
  SubscriptionPreviewResponse,
  SubscriptionStateResponse,
  SubscriptionTierOption,
  UsageBarData,
  UsageModelData
}
