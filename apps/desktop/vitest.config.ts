import { defineConfig, configDefaults } from 'vitest/config'

// e2e/** is Playwright's test suite (task 0.16), not vitest's — its own
// config (playwright.config.ts) runs it via `pnpm e2e`.
const exclude = [...configDefaults.exclude, 'e2e/**']

// Two projects instead of one environment (task 1.6.3): component tests need
// a DOM, the ~450 existing pure/main-process tests do not, and jsdom costs
// real time per file. The split is by extension — `*.test.tsx` renders React
// and gets jsdom, `*.test.ts` stays on node — so a test file declares its own
// environment by what it is, with nothing to keep in sync here.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          exclude: [...exclude, '**/*.test.tsx']
        }
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude
        }
      }
    ]
  }
})
