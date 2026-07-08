import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // e2e/** is Playwright's test suite (task 0.16), not vitest's — its own
    // config (playwright.config.ts) runs it via `pnpm e2e`.
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
