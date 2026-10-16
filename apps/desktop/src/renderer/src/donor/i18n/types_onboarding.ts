/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_onboarding.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface OnboardingTranslations {
  headerTitle: string
  headerDesc: string
  preparingInstall: string
  starting: string
  setupSlowTitle: string
  setupSlowBody: string
  continueWithoutSetup: string
  lookingUpProviders: string
  collapse: string
  otherProviders: string
  haveApiKey: string
  chooseLater: string
  recommended: string
  connected: string
  featuredPitch: string
  fireworksPitch: string
  localModelsTitle: string
  localModelsPitch: string
  openRouterPitch: string
  apiKeyOptions: Record<string, { short: string; description: string }>
  backToSignIn: string
  getKey: string
  replaceCurrent: string
  pasteApiKey: string
  localApiKeyPlaceholder: string
  localModelNamePlaceholder: string
  couldNotSave: string
  connecting: string
  update: string
  flowSubtitles: Record<string, string>
  startingSignIn: (provider: string) => string
  verifyingCode: (provider: string) => string
  connectedProvider: (provider: string) => string
  connectedPicking: (provider: string) => string
  signInFailed: string
  signInExpired: string
  signInDidNotFinish: (provider: string) => string
  tryAgain: string
  useApiKeyInstead: string
  errorDetails: string
  pickDifferentProvider: string
  signInWith: (provider: string) => string
  openedBrowser: (provider: string) => string
  authorizeThere: string
  copyAuthCode: string
  pasteAuthCode: string
  reopenAuthPage: string
  waitingAuthorize: string
  externalPending: (provider: string) => string
  signedIn: string
  deviceCodeOpened: (provider: string) => string
  reopenVerification: string
  copy: string
  defaultModel: string
  freeTier: string
  pro: string
  free: string
  price: (input: string, output: string) => string
  change: string
  startChatting: string
  docs: (provider: string) => string
}
