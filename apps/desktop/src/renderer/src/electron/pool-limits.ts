// `../electron/pool-limits` — the relative path their renderer uses to reach a
// pure module of their main process. Vendored file lives in the donor zone;
// this is only the path target (see donor/README.md § Layout).

export * from '../donor/hermes-electron/pool-limits'
