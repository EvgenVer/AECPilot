import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Task 3.9. Their messaging screen is mounted through TWO registration tables —
// the workspace router (`contrib/surfaces.tsx`) and the page-tile table
// (`chat/route-tile.tsx`) — while the sidebar item and the route constant live
// in a third file that was never edited. Phase 1.8 removed the first two as
// edit kind 3 ("UR19 lands in phase 3"), which left a sidebar button navigating
// to a route with no view behind it. This is the check that the two halves are
// back and stay together.
//
// It reads sources instead of rendering: importing that screen's module graph
// costs ~50 s under vitest's on-demand transform (measured 2026-08-17 — the
// donor's own test file for it was dropped for exactly this reason), and the
// fact worth pinning here is registration, which is a fact about the source.

const DONOR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'donor')

const read = (rel: string): string => readFileSync(path.join(DONOR_DIR, rel), 'utf8')

describe('поверхность внешних каналов зарегистрирована (UR19)', () => {
  it('роут и пункт боковой панели есть', () => {
    const routes = read('app/routes.ts')

    expect(routes).toContain("MESSAGING_ROUTE = '/messaging'")
    expect(routes).toContain("{ id: 'messaging', path: MESSAGING_ROUTE, view: 'messaging' }")
    expect(read('app/chat/sidebar/index.tsx')).toContain('route: MESSAGING_ROUTE')
  })

  it('экран смонтирован в обеих таблицах, а не в одной', () => {
    for (const file of ['app/contrib/surfaces.tsx', 'app/chat/route-tile.tsx']) {
      const source = read(file)

      expect(source, file).toContain("await import('../messaging')")
      expect(source, file).toContain('MessagingView')
    }
  })

  it('сам экран на месте', () => {
    expect(read('app/messaging/index.tsx')).toContain('export function MessagingView')
  })
})
