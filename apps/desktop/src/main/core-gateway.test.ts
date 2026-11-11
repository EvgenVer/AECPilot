// The single gateway's state in main (task T53.2): ensure, stop and tickets, on a fake core.
// The races here are the ones the fresh review of T53.2 found: a stop while an ensure or a
// mint is still under way must never start the gateway again.

import { afterEach, describe, expect, it } from 'vitest'

import {
  gatewayDial,
  gatewayRestTarget,
  localGatewayActive,
  startLocalGateway,
  stopLocalGateway,
  type GatewayModule
} from './core-gateway'
import type { GatewayEndpoint } from './local-gateway'

function endpointAt(port: number, instance = `inst-${port}`): GatewayEndpoint {
  return {
    profile_id: 'C:\\data\\profile',
    instance_id: instance,
    authority_epoch: 1,
    runtime_protocol: 1,
    api_origin: `http://127.0.0.1:${port}`,
    capabilities: ['session-authority-v1'],
    supervisor: 'none'
  }
}

function ready(endpoint: GatewayEndpoint, extra: Record<string, unknown> = {}) {
  return {
    code: 0,
    stdout: JSON.stringify({ state: 'ready', endpoint, ...extra }),
    stderr: '',
    ms: 1
  }
}

/** A fake core: `ensure` answers the queued results in order (or waits for a release). */
function fakeCore(answers: Array<ReturnType<typeof ready> | Promise<ReturnType<typeof ready>>>) {
  const log: string[] = []
  const mod: GatewayModule = {
    ensureGateway: async () => {
      log.push('ensure')
      const next = answers.shift()
      if (!next) throw new Error('no more ensure answers')
      return next
    },
    stopGateway: async () => {
      log.push('stop')
      return { code: 0, stdout: '', stderr: '', ms: 1 }
    },
    ticketRuntime: () => ({ command: 'python', args: [], cwd: '.', env: {} })
  }
  return { mod, log }
}

afterEach(async () => {
  await stopLocalGateway()
})

describe('single gateway state (T53.2)', () => {
  it('a stop during the first ensure waits for it, then stops — never «not running» first', async () => {
    let release: (value: ReturnType<typeof ready>) => void = () => undefined
    const { mod, log } = fakeCore([new Promise((resolve) => (release = resolve))])
    const starting = startLocalGateway(
      mod,
      () => ({}),
      async () => 'ticket'
    )
    await Promise.resolve()

    const stopping = stopLocalGateway()
    release(ready(endpointAt(1)))
    await starting.catch(() => undefined)
    await stopping

    expect(log).toEqual(['ensure', 'stop'])
    expect(localGatewayActive()).toBe(false)
  })

  it('a mint against a gone owner ensures once more and dials the new gateway', async () => {
    const { mod, log } = fakeCore([ready(endpointAt(1)), ready(endpointAt(2))])
    let mints = 0
    await startLocalGateway(
      mod,
      () => ({}),
      async () => {
        mints += 1
        if (mints === 1) throw new Error('Gateway ticket bootstrap failed')
        return 'fresh'
      }
    )

    const dial = await gatewayDial()

    expect(log).toEqual(['ensure', 'ensure'])
    expect(dial).toEqual({
      url: 'ws://127.0.0.1:2/api/ws',
      protocols: ['hermes-gateway-v1', 'hermes-gateway-ticket.fresh']
    })
  })

  it('a mint refused because the gateway was stopped meanwhile does not start it again', async () => {
    const { mod, log } = fakeCore([ready(endpointAt(1)), ready(endpointAt(2))])
    let fail: (error: Error) => void = () => undefined
    await startLocalGateway(
      mod,
      () => ({}),
      () => new Promise((_resolve, reject) => (fail = reject))
    )

    const dialing = gatewayDial()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await stopLocalGateway()
    fail(new Error('Gateway ticket bootstrap failed'))

    await expect(dialing).rejects.toThrow('Gateway stopped')
    expect(log).toEqual(['ensure', 'stop'])
  })

  it('replaces a gateway that runs other code than this core, once', async () => {
    // The stale owner names its code in the endpoint; the client names its own.
    const stale = ready({ ...endpointAt(1), code_sha: 'old' }, { client_code_sha: 'new' })
    const { mod, log } = fakeCore([stale, ready(endpointAt(2))])

    const endpoint = await startLocalGateway(
      mod,
      () => ({}),
      async () => 't'
    )

    expect(log).toEqual(['ensure', 'stop', 'ensure'])
    expect(endpoint.api_origin).toBe('http://127.0.0.1:2')
  })

  it('a REST grant that had to ensure again answers the new base address', async () => {
    const { mod } = fakeCore([ready(endpointAt(1)), ready(endpointAt(2))])
    let mints = 0
    await startLocalGateway(
      mod,
      () => ({}),
      async () => {
        mints += 1
        if (mints === 1) throw new Error('Gateway ticket bootstrap failed')
        return 'fresh'
      }
    )
    const target = gatewayRestTarget(() => 'default')!

    const grant = await target.grant!('http://127.0.0.1:1/api/status', 'GET', undefined)

    expect(grant).toEqual({
      headers: { 'X-Hermes-Gateway-Ticket': 'fresh' },
      baseUrl: 'http://127.0.0.1:2'
    })
  })

  it('reads the new key on every ensure, not the one of the first start', async () => {
    const seen: string[] = []
    let key = 'old'
    const mod: GatewayModule = {
      ensureGateway: async ({ extraEnv }) => {
        seen.push(String(extraEnv?.OPENROUTER_API_KEY))
        return ready(endpointAt(seen.length))
      },
      stopGateway: async () => ({ code: 0, stdout: '', stderr: '', ms: 1 }),
      ticketRuntime: () => ({ command: 'python', args: [], cwd: '.', env: {} })
    }
    await startLocalGateway(
      mod,
      () => ({ OPENROUTER_API_KEY: key }),
      async () => 't'
    )
    await stopLocalGateway()
    key = 'new'
    await startLocalGateway(
      mod,
      () => ({ OPENROUTER_API_KEY: key }),
      async () => 't'
    )

    expect(seen).toEqual(['old', 'new'])
  })
})
