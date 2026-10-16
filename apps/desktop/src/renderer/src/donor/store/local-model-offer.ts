/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/local-model-offer.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { readKey } from '@/lib/storage'

/** Install-level: the local-model offer opens at most once per install, and a dismiss is final. */
export const LOCAL_MODEL_OFFERED_KEY = 'hermes.desktop.firstRun.localModelOffered.v1'
/** When the offer's settle wait started, so a restart before it opens resumes the wait. */
export const LOCAL_MODEL_PENDING_KEY = 'hermes.desktop.firstRun.localModelPendingFrom.v1'

/** The local-model offer after onboarding is armed and not answered yet (false once this machine reads
 *  as unable to run a local model). The sign-in offer waits for it: the local-model offer comes first. */
export const $localModelOfferPending = atom(
  Boolean(readKey(LOCAL_MODEL_PENDING_KEY)) && !readKey(LOCAL_MODEL_OFFERED_KEY)
)
