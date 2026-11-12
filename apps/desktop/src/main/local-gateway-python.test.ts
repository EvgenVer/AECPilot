// The ticket helper of the single gateway (task T53.2, technical debt of its review): one
// private interpreter per profile, a JSON line per ticket over stdin/stdout. A fake helper
// stands in for the core's client — the same line protocol, no gateway — so the bridge's
// own rules are what is tested: requests, replies, refusals and disposal.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { GatewayEndpoint } from './local-gateway'
import {
  closeGatewayTicketBridges,
  mintGatewayTicketWithPython,
  type TicketRuntime
} from './local-gateway-python'

const VENV_PYTHON = path.resolve(__dirname, '../../../../.venv/Scripts/python.exe')
const PYTHON = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : 'python'
const hasPython = spawnSync(PYTHON, ['--version']).status === 0

// Started as `python -u fake.py -c <their script>`: argv after the file is ignored. The
// ticket names the helper's pid, the purpose and HERMES_HOME, so a test sees which helper
// answered and with what. A profile named `refuse` answers an error; `garbage` a broken line.
const FAKE = String.raw`
import json, os, sys
while True:
    line = sys.stdin.readline()
    if not line:
        break
    request = json.loads(line)
    home = request['endpoint']['profile_id']
    if home.endswith('refuse'):
        reply = {'id': request['id'], 'error': 'owner_mismatch'}
    elif home.endswith('garbage'):
        print('not json', flush=True)
        continue
    elif home.endswith('silent'):
        continue
    else:
        reply = {'id': request['id'],
                 'ticket': '%d|%s|%s' % (os.getpid(), request['purpose'], os.environ.get('HERMES_HOME'))}
    print(json.dumps(reply), flush=True)
`

let dir = ''
let runtime: TicketRuntime

function endpoint(profile: string): GatewayEndpoint {
  return {
    profile_id: path.join(dir, profile),
    instance_id: 'inst-1',
    authority_epoch: 1,
    runtime_protocol: 1,
    api_origin: 'http://127.0.0.1:1',
    capabilities: ['session-authority-v1'],
    supervisor: 'none'
  }
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-ticket-helper-'))
  const script = path.join(dir, 'fake_helper.py')
  fs.writeFileSync(script, FAKE, 'utf8')
  runtime = { command: PYTHON, args: [script], cwd: dir, env: { ...process.env } }
})

afterEach(() => closeGatewayTicketBridges())

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe.skipIf(!hasPython)('ticket helper (T53.2)', () => {
  it('mints a ticket for the purpose, in the profile the endpoint names', async () => {
    const ticket = await mintGatewayTicketWithPython(runtime, endpoint('alpha'), 'interactive')
    const [pid, purpose, home] = ticket.split('|')

    expect(Number(pid)).toBeGreaterThan(0)
    expect(purpose).toBe('interactive')
    expect(home, 'HERMES_HOME is the endpoint profile').toBe(path.join(dir, 'alpha'))
  })

  it('one helper per profile: two tickets share it, another profile gets its own', async () => {
    const first = await mintGatewayTicketWithPython(runtime, endpoint('alpha'), 'native-http')
    const second = await mintGatewayTicketWithPython(runtime, endpoint('alpha'), 'native-http')
    const other = await mintGatewayTicketWithPython(runtime, endpoint('beta'), 'native-http')

    expect(second.split('|')[0]).toBe(first.split('|')[0])
    expect(other.split('|')[0]).not.toBe(first.split('|')[0])
  })

  it('a refusal rejects with the reason the core gave', async () => {
    await expect(
      mintGatewayTicketWithPython(runtime, endpoint('refuse'), 'native-http')
    ).rejects.toMatchObject({
      message: 'Gateway ticket bootstrap failed',
      reason: 'owner_mismatch'
    })
  })

  it('a broken reply retires the helper; the next ticket starts a fresh one', async () => {
    await expect(
      mintGatewayTicketWithPython(runtime, endpoint('garbage'), 'native-http')
    ).rejects.toThrow('Gateway ticket bootstrap failed')
    // The profile name decides the fake's behaviour, so take a fresh helper for a good one.
    const ok = await mintGatewayTicketWithPython(runtime, endpoint('alpha'), 'native-http')
    expect(ok).toMatch(/\|native-http\|/)
  })

  it('closing the helpers rejects a ticket still waiting — a stop never hangs a request', async () => {
    const waiting = mintGatewayTicketWithPython(runtime, endpoint('silent'), 'native-http')
    await new Promise((resolve) => setTimeout(resolve, 200))
    closeGatewayTicketBridges()

    await expect(waiting).rejects.toThrow('Gateway ticket bootstrap failed')
  })

  it('a request over 64 KiB is refused before it reaches the helper', async () => {
    const huge = { ...endpoint('alpha'), instance_id: 'x'.repeat(70_000) }
    await expect(mintGatewayTicketWithPython(runtime, huge, 'native-http')).rejects.toThrow(
      'Gateway ticket request too large'
    )
  })
})
