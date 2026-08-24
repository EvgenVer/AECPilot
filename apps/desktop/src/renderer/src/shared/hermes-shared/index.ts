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
  type DonorConnectionState as ConnectionState,
  type DonorGatewayEvent as GatewayEvent,
  type GatewayClientOptions
} from '../gateway-bridge'

export type GatewayEventName = string

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
