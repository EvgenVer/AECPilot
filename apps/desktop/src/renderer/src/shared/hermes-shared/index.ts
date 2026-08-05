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
  GatewayBridge as JsonRpcGatewayClient,
  type DonorConnectionState as ConnectionState,
  type DonorGatewayEvent as GatewayEvent,
  type GatewayClientOptions
} from '../gateway-bridge'

export type GatewayEventName = string
