// `../electron/notification-types` — the relative path their renderer uses to
// reach a types-only module of their main process. Vendored file lives in the
// donor zone; this is only the path target (see donor/README.md § Layout).

export type * from '../donor/hermes-electron/notification-types'
