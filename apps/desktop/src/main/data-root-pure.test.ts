// Tasks T39, T41: an installed tree keeps Electron's data and its children's scratch and
// caches under `<root>/data`; a working copy keeps the defaults.

import { delimiter, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  dataEnvDirs,
  installedDataDir,
  installedDataEnv,
  installedUserData
} from './data-root-pure'

const root = join('D:', 'AECPilot')
const manifest = join(root, 'runtime', 'core', 'manifest.json')
const data = join(root, 'data')

describe('installedDataDir', () => {
  it('is <root>/data in an installed tree', () => {
    expect(installedDataDir({ root, exists: (file) => file === manifest })).toBe(data)
  })

  it('is null for a working copy, even with a staged payload', () => {
    const exists = (file: string): boolean => file === manifest || file === join(root, '.git')
    expect(installedDataDir({ root, exists })).toBeNull()
  })

  it('is <root>/data in a client installation without the core (T31)', () => {
    const mode = join(root, 'install-mode.txt')
    expect(installedDataDir({ root, exists: (file) => file === mode })).toBe(data)
  })

  it('is null for a tree without the payload', () => {
    expect(installedDataDir({ root, exists: () => false })).toBeNull()
  })
})

describe('installedUserData', () => {
  it('moves userData under <root>/data', () => {
    expect(installedUserData(data, false)).toBe(join(data, 'userData'))
  })

  it('never overrides an explicit --user-data-dir, nor a working copy', () => {
    expect(installedUserData(data, true)).toBeNull()
    expect(installedUserData(null, false)).toBeNull()
  })
})

describe('installedDataEnv', () => {
  it('points scratch, caches and npm under <root>/data and appends the npm prefix', () => {
    const env = installedDataEnv(data, { Path: ['C:\\Windows', 'C:\\bin'].join(delimiter) })

    expect(env.TEMP).toBe(join(data, 'tmp'))
    expect(env.TMP).toBe(env.TEMP)
    expect(env.XDG_CACHE_HOME).toBe(join(data, 'cache'))
    expect(env.XDG_CONFIG_HOME).toBe(join(data, 'config'))
    expect(env.HF_HOME).toBe(join(data, 'cache', 'huggingface'))
    expect(env.npm_config_prefix).toBe(join(data, 'npm'))
    expect(env.npm_config_cache).toBe(join(data, 'cache', 'npm'))
    expect(env.PATH).toBeUndefined()
    expect(env.Path.split(delimiter)).toEqual(['C:\\Windows', 'C:\\bin', join(data, 'npm')])
    expect(dataEnvDirs(env)).toEqual([
      join(data, 'tmp'),
      join(data, 'cache'),
      join(data, 'config'),
      join(data, 'npm')
    ])
  })

  it('does not add the npm prefix twice', () => {
    const env = installedDataEnv(data, { PATH: join(data, 'npm') })
    expect(env.PATH.split(delimiter)).toEqual([join(data, 'npm')])
  })

  it('never sets a pycache prefix (the payloads ship baked bytecode)', () => {
    expect(installedDataEnv(data, {})).not.toHaveProperty('PYTHONPYCACHEPREFIX')
  })
})
