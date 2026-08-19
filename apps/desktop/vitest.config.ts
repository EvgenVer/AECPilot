import { defineConfig, configDefaults } from 'vitest/config'
import { donorAliases } from './electron.vite.config'

// e2e/** is Playwright's test suite (task 0.16), not vitest's — its own
// config (playwright.config.ts) runs it via `pnpm e2e`.
const exclude = [...configDefaults.exclude, 'e2e/**']

// Two projects instead of one environment (task 1.6.3): component tests need
// a DOM, the ~450 existing pure/main-process tests do not, and jsdom costs
// real time per file. The split is by extension — `*.test.tsx` renders React
// and gets jsdom, `*.test.ts` stays on node — so a test file declares its own
// environment by what it is, with nothing to keep in sync here.
export default defineConfig({
  // Same aliases the renderer build uses, so a vendored donor file resolves
  // identically under vitest and under vite.
  resolve: { alias: donorAliases },
  test: {
    projects: [
      {
        resolve: { alias: donorAliases },
        test: {
          name: 'node',
          environment: 'node',
          exclude: [...exclude, '**/*.test.tsx'],
          // exceljs идёт в Node как есть (задача 4.3). Через конвейер vitest
          // его мегабайтная CJS-сборка со всем деревом зависимостей едет 48
          // секунд против 0,2 секунды у самого Node — измерено. В сборке
          // главного процесса этого шага нет вовсе.
          server: { deps: { external: ['exceljs'] } },
          // Task D-33. Same ceiling as the DOM project below, and for the same
          // reason: `sheet-read.test.ts` really opens and parses a workbook, and
          // under a full parallel run on a busy machine that outran the 5 s
          // default — while passing in 2,8 s in isolation. The assertion waits
          // for work to finish, not for a timer, so a higher ceiling costs
          // nothing when the machine is idle.
          testTimeout: 15000,
          // The two projects have different worker limits (see 'dom' below),
          // and vitest refuses to schedule differing limits in one group — so
          // they run as two groups: the fast node suite first, then the DOM
          // one on its own.
          sequence: { groupOrder: 0 }
        }
      },
      {
        resolve: { alias: donorAliases },
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
          // Milkdown и его ProseMirror идут в Node как есть (задача 4.5): через
          // конвейер vitest их дерево модулей едет полторы минуты, снаружи —
          // секунды. Ровно та же причина, что у exceljs выше.
          server: { deps: { external: [/@milkdown/, /prosemirror/] } },
          // Same reason: the assertions wait for a promise chain to settle,
          // not for a timer, so a longer ceiling costs nothing when things are
          // fast and stops a green suite from turning red under load.
          //
          // Raised 15 s → 30 s for D-33: fifteen still was not enough for the
          // Milkdown editor tests during a full run on a loaded machine (twice
          // in one session), and they pass in seconds on their own. This is the
          // SECOND raise. If it happens a third time the answer is not a bigger
          // number — it is running the heavy-import files in their own group,
          // the way the node/dom split already works.
          testTimeout: 30000
        }
      },
      {
        // runtime/ holds the core-watching tools (task 1.7.5): plain .mjs, no
        // Electron, no DOM. They live outside this app because the app is only
        // one of their callers, but `pnpm test` is the only test runner this
        // repo has — a tool nobody runs is a tool nobody trusts. Its own root
        // keeps the app's globs from reaching into the vendored core checkout
        // under runtime/.hermes-src.
        test: {
          name: 'runtime',
          root: '../../runtime',
          environment: 'node',
          include: ['*.test.mjs'],
          sequence: { groupOrder: 0 }
        }
      }
    ]
  }
})
