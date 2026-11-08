// Task T54 — the `advanced-delegation` plugin goes into every profile from its pin.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  DELEGATION_PLUGIN_FILES,
  DELEGATION_PLUGIN_ID,
  installDelegationPlugin,
  isPluginDisabledInConfigYaml
} from './register-delegation-plugin.mjs'
import { mergePluginEnabledIntoConfigYaml } from './register-secret-filter.mjs'

const temps = []
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-delegation-plugin-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true })
})

function fakeSource() {
  const dir = tempDir()
  for (const name of DELEGATION_PLUGIN_FILES) fs.writeFileSync(path.join(dir, name), `${name} v1\n`)
  fs.mkdirSync(path.join(dir, 'tests'))
  fs.writeFileSync(path.join(dir, 'tests', 'test_x.py'), 'import pytest\n')
  fs.writeFileSync(path.join(dir, 'pytest.ini'), '[pytest]\n')
  return dir
}

describe('installDelegationPlugin', () => {
  it('copies the plugin files, and only them, into <home>/plugins/advanced-delegation', () => {
    const home = tempDir()
    const source = fakeSource()
    expect(installDelegationPlugin(home, source)).toEqual({ changed: true, missing: false })
    const target = path.join(home, 'plugins', DELEGATION_PLUGIN_ID)
    expect(fs.readdirSync(target).sort()).toEqual([...DELEGATION_PLUGIN_FILES].sort())
    expect(installDelegationPlugin(home, source)).toEqual({ changed: false, missing: false })
  })

  it('brings a changed source file across on the next start', () => {
    const home = tempDir()
    const source = fakeSource()
    installDelegationPlugin(home, source)
    fs.writeFileSync(path.join(source, 'model_map.py'), 'v2\n')
    expect(installDelegationPlugin(home, source).changed).toBe(true)
    expect(
      fs.readFileSync(path.join(home, 'plugins', DELEGATION_PLUGIN_ID, 'model_map.py'), 'utf-8')
    ).toBe('v2\n')
  })

  it('leaves the profile alone when setup has not fetched the source', () => {
    const home = tempDir()
    expect(installDelegationPlugin(home, path.join(home, 'nope'))).toEqual({
      changed: false,
      missing: true
    })
    expect(fs.existsSync(path.join(home, 'plugins'))).toBe(false)
  })
})

describe('isPluginDisabledInConfigYaml', () => {
  it('sees the plugin in a block list under plugins.disabled', () => {
    const yaml =
      'plugins:\n  enabled:\n    - aec-secret-filter\n  disabled:\n    - advanced-delegation\n'
    expect(isPluginDisabledInConfigYaml(yaml, DELEGATION_PLUGIN_ID)).toBe(true)
  })

  it('sees it in an inline list', () => {
    expect(
      isPluginDisabledInConfigYaml(
        "plugins:\n  disabled: ['advanced-delegation']\n",
        DELEGATION_PLUGIN_ID
      )
    ).toBe(true)
  })

  it('does not take plugins.enabled or another section for plugins.disabled', () => {
    const yaml =
      'plugins:\n  enabled:\n    - advanced-delegation\n  disabled:\n    - spotify\nother:\n  disabled:\n    - advanced-delegation\n'
    expect(isPluginDisabledInConfigYaml(yaml, DELEGATION_PLUGIN_ID)).toBe(false)
    expect(isPluginDisabledInConfigYaml('', DELEGATION_PLUGIN_ID)).toBe(false)
  })

  it('reads a list written without the extra indent (PyYAML, by hand) — review T54', () => {
    const yaml = 'plugins:\n  enabled:\n  - aec-secret-filter\n  disabled:\n  - advanced-delegation\n'
    expect(isPluginDisabledInConfigYaml(yaml, DELEGATION_PLUGIN_ID)).toBe(true)
  })
})

describe('plugins.enabled for advanced-delegation', () => {
  it('is added next to the secret filter without dropping it', () => {
    const first = mergePluginEnabledIntoConfigYaml('model: x\n')
    const both = mergePluginEnabledIntoConfigYaml(first.text, DELEGATION_PLUGIN_ID)
    expect(both.text).toBe(
      'model: x\nplugins:\n  enabled:\n    - aec-secret-filter\n    - advanced-delegation\n'
    )
    expect(mergePluginEnabledIntoConfigYaml(both.text, DELEGATION_PLUGIN_ID).changed).toBe(false)
  })

  it('keeps a list without the extra indent valid and does not repeat a present item — review T54', () => {
    const yaml = 'plugins:\n  enabled:\n  - aec-secret-filter\n  disabled:\n  - spotify\n'
    const merged = mergePluginEnabledIntoConfigYaml(yaml, DELEGATION_PLUGIN_ID)
    expect(merged.text).toBe(
      'plugins:\n  enabled:\n  - aec-secret-filter\n  - advanced-delegation\n  disabled:\n  - spotify\n'
    )
    expect(mergePluginEnabledIntoConfigYaml(yaml, 'aec-secret-filter').changed).toBe(false)
  })

  it('fills an empty flow list instead of adding a second `enabled:` — review T54', () => {
    const merged = mergePluginEnabledIntoConfigYaml('plugins:\n  enabled: []\n  disabled: []\n')
    expect(merged.text).toBe('plugins:\n  enabled:\n    - aec-secret-filter\n  disabled: []\n')
  })
})
