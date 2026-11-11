import { describe, expect, it } from 'vitest'

import { coreWire, scopeGatewayRestPath, windowProfile } from './core-gateway-pure'
import {
  assertLocalGatewayEndpoint,
  gatewayEndpointFromEnsure,
  isStaleLocalGatewayError,
  nativeGrantPurpose,
  nativeGrantRoute,
  parseGatewayEnsureOutput,
  routedGatewayEndpoint,
  staleGatewayCode,
  type GatewayEndpoint
} from './local-gateway'

const endpoint: GatewayEndpoint = {
  profile_id: 'C:\\data\\profile',
  instance_id: 'inst-1',
  authority_epoch: 1,
  runtime_protocol: 1,
  api_origin: 'http://127.0.0.1:52216',
  capabilities: ['durable-admission-v1', 'event-replay-v1', 'session-authority-v1'],
  supervisor: 'none'
}

describe('which wire the window speaks (decision 0017)', () => {
  it('a full installation working locally is on the single gateway', () => {
    expect(coreWire({ role: 'full', mode: 'local', gatewayOverride: false })).toBe('canonical')
  })

  it('the server role, a remote or ssh core and the e2e mock keep the legacy wire', () => {
    expect(coreWire({ role: 'server', mode: 'local', gatewayOverride: false })).toBe('legacy')
    expect(coreWire({ role: 'client', mode: 'local', gatewayOverride: false })).toBe('legacy')
    expect(coreWire({ role: 'full', mode: 'remote', gatewayOverride: false })).toBe('legacy')
    expect(coreWire({ role: 'full', mode: 'ssh', gatewayOverride: false })).toBe('legacy')
    expect(coreWire({ role: 'full', mode: 'local', gatewayOverride: true })).toBe('legacy')
  })
})

describe('REST paths a native-http ticket needs scoped (T53.1: 403 without, 200 with)', () => {
  it('adds the profile to the cron job routes', () => {
    expect(scopeGatewayRestPath('/api/cron/jobs', 'GET', 'default')).toBe(
      '/api/cron/jobs?profile=default'
    )
    expect(scopeGatewayRestPath('/api/cron/jobs/abc/pause', 'POST', 'kzh')).toBe(
      '/api/cron/jobs/abc/pause?profile=kzh'
    )
  })

  it('adds recents_profile to the sidebar read', () => {
    expect(scopeGatewayRestPath('/api/profiles/sessions/sidebar?limit=5', 'GET', 'default')).toBe(
      '/api/profiles/sessions/sidebar?limit=5&recents_profile=default'
    )
  })

  it('leaves a request that already names its profile, and every other route, alone', () => {
    expect(scopeGatewayRestPath('/api/cron/jobs?profile=all', 'GET', 'default')).toBe(
      '/api/cron/jobs?profile=all'
    )
    expect(scopeGatewayRestPath('/api/sessions', 'GET', 'default')).toBe('/api/sessions')
    expect(scopeGatewayRestPath('/api/cronx/jobs', 'GET', 'default')).toBe('/api/cronx/jobs')
  })

  it('names the launch profile default', () => {
    expect(windowProfile(undefined)).toBe('default')
    expect(windowProfile(' kzh ')).toBe('kzh')
  })
})

describe('gateway ensure verdicts (ported from their local-gateway.ts)', () => {
  it('reads the endpoint of a ready owner', () => {
    const result = { code: 0, stdout: JSON.stringify({ state: 'ready', endpoint }) }
    expect(gatewayEndpointFromEnsure(result, parseGatewayEnsureOutput(result))).toEqual(endpoint)
  })

  it('names the reason of an empty answer instead of a JSON parse error', () => {
    expect(() =>
      parseGatewayEnsureOutput({ code: 2, stdout: '', stderr: 'boom\nNo such command' })
    ).toThrow('hermes gateway ensure produced no result (exit 2): No such command.')
  })

  it('refuses a gateway that is not ready, with the core reason', () => {
    const result = {
      code: 1,
      stdout: JSON.stringify({
        state: 'inaccessible',
        reason_code: 'runtime_exited',
        detail: 'crash\nmore'
      })
    }
    expect(() => gatewayEndpointFromEnsure(result, parseGatewayEnsureOutput(result))).toThrow(
      'Gateway inaccessible (runtime_exited). crash.'
    )
  })

  it('accepts only a loopback endpoint with session authority (C11)', () => {
    expect(() => assertLocalGatewayEndpoint(endpoint)).not.toThrow()
    expect(() =>
      assertLocalGatewayEndpoint({ ...endpoint, api_origin: 'http://192.168.1.5:52216' })
    ).toThrow()
    expect(() =>
      assertLocalGatewayEndpoint({ ...endpoint, api_origin: 'http://127.0.0.1:52216/x' })
    ).toThrow()
    expect(() => assertLocalGatewayEndpoint({ ...endpoint, capabilities: [] })).toThrow()
  })

  it('tells a gateway that runs other code than this client', () => {
    expect(staleGatewayCode({ endpoint: { code_sha: 'AAA' }, client_code_sha: 'aaa' })).toBeNull()
    expect(staleGatewayCode({ endpoint: { code_sha: 'aaa' }, client_code_sha: 'bbb' })).toEqual({
      gateway: 'aaa',
      client: 'bbb'
    })
    expect(staleGatewayCode({ endpoint: {} })).toBeNull()
  })

  it('reads a failed mint as a gone owner', () => {
    expect(isStaleLocalGatewayError(new Error('Gateway ticket bootstrap failed'))).toBe(true)
    expect(isStaleLocalGatewayError(new Error('Profile x does not exist'))).toBe(false)
  })
})

describe('which ticket a REST request needs (ported)', () => {
  it('picks the registry grants for profile create, rename and delete', () => {
    expect(nativeGrantPurpose('http://127.0.0.1:1/api/profiles', 'POST')).toBe(
      'native-profile-create'
    )
    expect(nativeGrantPurpose('http://127.0.0.1:1/api/profiles/kzh', 'DELETE')).toBe(
      'native-profile-registry'
    )
    expect(nativeGrantPurpose('http://127.0.0.1:1/api/profiles/active', 'GET')).toBe('native-http')
    expect(nativeGrantPurpose('http://127.0.0.1:1/api/sessions', 'GET')).toBe('native-http')
  })

  it('mints for the profile the URL or the body names', () => {
    const url = 'http://127.0.0.1:1/api/cron/jobs?profile=kzh'
    expect(nativeGrantRoute(url)).toBe(url)
    expect(nativeGrantRoute('http://127.0.0.1:1/api/sessions/1', { profile: 'kzh' }, 'PATCH')).toBe(
      'kzh'
    )
    expect(routedGatewayEndpoint(endpoint, url).profile_id).toBe('C:\\data\\profile\\profiles\\kzh')
    expect(routedGatewayEndpoint(endpoint, 'default')).toBe(endpoint)
    expect(() => routedGatewayEndpoint(endpoint, '../x')).toThrow('Invalid profile route')
  })
})
