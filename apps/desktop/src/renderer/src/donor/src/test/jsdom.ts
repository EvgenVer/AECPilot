// `./src/test/jsdom` — the path their `vitest.setup.ts` imports from, relative to
// THEIR app root. Ours sits beside the zone (see its note), so the relative
// path lands here; the vendored file lives in the mirror at `test/jsdom.ts`.
// Only the path target, like `renderer/src/electron/*` (donor/README.md § Layout).

export * from '../../test/jsdom'
