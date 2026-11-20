// The legacy wire, kept in the fast run (T53 debt, owner's decision 2026-11-20).
//
// Since the mock learned the canonical protocol, the whole fast suite drives the window the
// way the installed app does — over the single gateway's canonical wire. The legacy wire of
// `hermes serve` is still a product path: the server installation's clients over the tunnel,
// a remote core and an SSH connection all speak it. Their own live specs cover those roles
// (`acceptance/live-server-gateway*.spec.ts`, `ac11-*.spec.ts`), but they are slow and outside
// `pnpm e2e`; this one keeps the bridge's legacy half from rotting unseen in between. The app
// asks for it with `AEC_GATEWAY_WIRE=legacy` (read only under the mock, `windowWire`).

import { test, expect } from '@playwright/test'
import { hideFirstRunSurfaces, mainWindow, openProject, send, standFixture } from './lib/app'

const stand = standFixture({
  mode: 'mock',
  label: 'legacy-wire-smoke',
  env: { AEC_GATEWAY_WIRE: 'legacy' }
})

test('the legacy wire still carries a turn: no subprotocol, no ticket, the serve shapes', async () => {
  const page = await mainWindow(stand.get())
  await openProject(stand.get(), page)
  await hideFirstRunSurfaces(page)

  const view = await page.evaluate(() => window.aecpilot.getConnection())
  expect(view.coreWire).toBe('legacy')

  await send(page, 'legacy ping')
  await expect(page.getByText('PONG', { exact: true }).last()).toBeVisible({ timeout: 30000 })

  const output = stand.get().mockOutput()
  expect(output).toContain('MOCK_WIRE legacy')
  expect(output).not.toContain('MOCK_WIRE canonical')
  // The legacy contract refuses the donor's `submission_id` and the donor retries without it
  // (task T52); the turn then runs on the serve shape.
  expect(output).toMatch(/MOCK_RPC prompt\.submit session_id='e2e-\d+' text='legacy ping'/)

  const response = await fetch(`http://127.0.0.1:${stand.get().restPort}/api/_mock/wire`)
  const wire = (await response.json()) as { ws: string[]; rest_ticketed: number }
  expect(new Set(wire.ws)).toEqual(new Set(['legacy']))
  expect(wire.rest_ticketed, 'no gateway ticket on the legacy wire').toBe(0)
})
