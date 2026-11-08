// `../../../shared/src/session-http-mutations` — the relative path two of their
// renderer files use to reach their `apps/shared/src` package directly instead
// of through `@hermes/shared` (0.23.0). The vendored file lives in the donor zone
// (`donor/hermes-shared/`); this is only the path target, like the
// `renderer/src/electron/*` stubs (see donor/README.md § Layout).

export * from '../../src/donor/hermes-shared/session-http-mutations'
