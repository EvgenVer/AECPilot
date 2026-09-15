// Stand-in for the donor's `@hermes/shared` workspace package (aliased in
// electron.vite.config.ts, tsconfig.json and vitest.config.ts). It exists so
// vendored files keep their own import lines.
//
// Three kinds of member live here:
//   1. re-exports of pieces we vendored verbatim (`donor/hermes-shared/*`)
//   2. the gateway client, REPLACED by our IPC bridge — their real one opens a
//      WebSocket from the renderer, which SPEC C9 forbids. Their
//      `json-rpc-gateway.ts` is deliberately NOT vendored: an unused copy of a
//      socket client in our tree is a trap, not a reference.
//   3. the handful of types that only existed inside that client file
//
// Grow it when a newly vendored file needs a member it does not have — tsc
// will say so by name.

export type { BillingBlock } from '../../donor/hermes-shared/billing-types'
export { hasAnsi, sanitizeAnsiForRender, stripAnsi } from '../../donor/hermes-shared/ansi'
export {
  contrastRatio,
  darken,
  ensureContrast,
  lighten,
  mix,
  parseColor,
  readableOn,
  relativeLuminance,
  type Rgb,
  toHex
} from '../../donor/hermes-shared/color'
export { compactNumber } from '../../donor/hermes-shared/format'
export {
  type FuzzyMatch,
  fuzzyRank,
  fuzzyScore,
  fuzzyScoreMulti,
  type RankedItem
} from '../../donor/hermes-shared/fuzzy'
export * from '../../donor/hermes-shared/gateway-events'
export {
  applyDocumentLocale,
  type EndonymLocale,
  isRecord,
  LOCALE_ENDONYMS,
  mergeTranslations,
  RTL_LOCALES,
  type TranslationOverride
} from '../../donor/hermes-shared/i18n'
// Kind 3 (0.21.3, task 3.B5в): the request/response channel their socket
// client is built on. Vendored for its TYPES and pure helpers — the class is
// not instantiated here, the bridge above plays its part over IPC.
export {
  DEFAULT_HEARTBEAT_DEADLINE_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  type GatewayRequestId,
  JSON_RPC_METHOD_NOT_FOUND,
  jsonRpcErrorFromFrame,
  type JsonRpcErrorPayload,
  type JsonRpcFrame,
  JsonRpcRequestChannel,
  type JsonRpcRequestChannelOptions,
  type JsonRpcTransport,
  type ServerRequestParams,
  wireFrameText
} from '../../donor/hermes-shared/json-rpc-channel'
export { modelSearchText } from '../../donor/hermes-shared/model-search-text'
export {
  DEFAULT_REASONING_EFFORT,
  isReasoningEffort,
  REASONING_EFFORT_VALUES,
  REASONING_EFFORTS,
  type ReasoningEffort,
  type ReasoningEffortValue
} from '../../donor/hermes-shared/reasoning-effort'
export {
  reconnectBackoffDelayMs,
  type ReconnectBackoffOptions
} from '../../donor/hermes-shared/reconnect-backoff'
export {
  type AliasCommandDispatchResponse,
  type CommandDispatchResponse,
  type ExecCommandDispatchResponse,
  looksLikeSlashCommand,
  parseCommandDispatch,
  type ParsedSlashCommand,
  parseSlashCommand,
  type PrefillCommandDispatchResponse,
  type SendCommandDispatchResponse,
  type SkillCommandDispatchResponse,
  SLASH_COMMAND_RE
} from '../../donor/hermes-shared/slash'
export {
  THEME_PRESET_PALETTES,
  type ThemePresetColors,
  type ThemePresetName,
  type ThemePresetPalette
} from '../../donor/hermes-shared/theme-presets'
export {
  clampDataUrlReadMaxMb,
  DATA_URL_READ_DEFAULT_MAX_MB,
  DATA_URL_READ_MAX_MAX_MB,
  DATA_URL_READ_MIN_MAX_MB
} from '../../donor/hermes-shared/data-url-read-max'
export { skillInvocationText } from '../../donor/hermes-shared/skill-scaffold'
export {
  buildHermesWebSocketUrl,
  type GatewayAuthMode,
  GatewayReauthRequiredError,
  type GatewayWsConnection,
  type GatewayWsUrlResult,
  type HermesWebSocketUrlOptions,
  isGatewayReauthRequired,
  resolveGatewayWsUrl,
  type ResolveGatewayWsUrlDeps,
  type WebSocketAuthParam
} from '../../donor/hermes-shared/websocket-url'
export {
  type HermesSkin,
  SKIN_BRANDING_TOKENS,
  SKIN_COLOR_TOKENS,
  type SkinBranding,
  type SkinBrandingToken,
  type SkinColors,
  type SkinColorToken
} from '../../donor/hermes-shared/skin'

export {
  backendScopeKey,
  backendScopePrefix,
  LOCAL_CONNECTION_ID,
  registryBackendScopeKey
} from '../../donor/hermes-shared/backend-scope'
export {
  type CronTriggerController,
  type CronTriggerRunResult,
  createCronTriggerController
} from '../../donor/hermes-shared/cron-trigger-controller'

export {
  GatewayBridge as JsonRpcGatewayClient,
  type DonorServerRequest as ServerRequest,
  type DonorServerRequestHandler as ServerRequestHandler,
  type DonorConnectionState as ConnectionState,
  type GatewayClientOptions
} from '../gateway-bridge'

// `GatewayEvent` / `GatewayEventName` are theirs now — generated from the
// core's contract, re-exported above with `gateway-events` (0.21.3).

// Kind 3 (see the header): a class that lived only inside their un-vendored
// `json-rpc-gateway.ts`. Their code narrows on it — `use-prompt-actions`
// asks `err instanceof JsonRpcGatewayError && err.code === 4018` to tell
// "the message you are rewinding to was compressed away" from any other
// failure.
//
// GAP CLOSED 2026-08-24 (finding D-37). It used to be recorded here as a known
// gap: a gateway error crossed `ipcRenderer.invoke` as a plain Error — Electron
// keeps the message and drops custom fields — so `code` and `data` were lost on
// the way and the check above was false ALWAYS. The fix is that the failure now
// crosses our IPC boundary as DATA (`GatewayRpcOutcome` in `shared/ipc.ts`) and
// is turned back into this error in `gateway-bridge.ts`, code and data intact.
// The definition lives there because that is what throws it; re-exported here so
// `@hermes/shared` keeps resolving for their files.
export { JsonRpcGatewayError } from '../gateway-bridge'

// Kind 3 again (0.21.2, task 3.B4): a URL predicate that lives beside their
// socket client — `use-gateway-boot` narrows a remote connection's address on
// it before it would dial. Pure, copied verbatim from their
// `json-rpc-gateway.ts` so the narrowing keeps their exact meaning.
/** True for a `ws://` / `wss://` URL string — the only thing their client would dial. */
export function isGatewayWebSocketUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false

  try {
    const protocol = new URL(value).protocol

    return protocol === 'ws:' || protocol === 'wss:'
  } catch {
    return false
  }
}
