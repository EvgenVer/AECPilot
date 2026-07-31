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
          exclude: [...exclude, '**/*.test.tsx'],
          // The two projects have different worker limits (see 'dom' below),
          // and vitest refuses to schedule differing limits in one group — so
          // they run as two groups: the fast node suite first, then the DOM
          // one on its own.
          sequence: { groupOrder: 0 }
        }
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude,
          // Component files grew from 1 to 12 in batches 2–3, and each one
          // pays for its own jsdom instance. Run at most four at a time: on a
          // loaded machine the unbounded pool starved workers badly enough
          // that files failed to start at all (vitest's worker-start limit is
          // a hard 60 s) and `waitFor`'s 1 s default expired on renders that
          // are instant when the machine is idle. Measured: the same files
          // pass in isolation and fail only in a full parallel run.
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
          // Same reason: the assertions wait for a promise chain to settle,
          // not for a timer, so a longer ceiling costs nothing when things are
          // fast and stops a green suite from turning red under load.
          testTimeout: 15000
        }
      }
    ]
  }
})
