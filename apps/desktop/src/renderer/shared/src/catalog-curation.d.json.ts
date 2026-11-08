// Types for `../../../../../shared/src/catalog-curation.json`, the relative path
// their `catalog-curation.ts` imports its data by (0.23.0). The JSON itself is
// vendored in the donor zone (`donor/hermes-shared/catalog-curation.json`) and
// reaches the bundle through the `shared/src/` alias in electron.vite.config.ts;
// this declaration gives tsc the same shape without a second copy.

declare const curation: typeof import('../../src/donor/hermes-shared/catalog-curation.json')
export default curation
