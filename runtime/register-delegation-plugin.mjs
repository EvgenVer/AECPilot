// Task T54 (UR48): the official `advanced-delegation` plugin — named model routes and
// profile routes for subagents — copied into the profile from its pin.
//
// WHY A COPY FROM THE PIN, NOT THEIR CATALOG INSTALL. Their window offers to install the
// plugin from GitHub through the catalog dialog. The product ships it instead (UR48: in
// the delivery, pinned by commit, never fetched from the network), so setup fetches the
// commit their own catalog reviewed (`hermes-env.mjs::DELEGATION_PLUGIN_SHA`) and this
// module puts it where the core looks for user plugins: `$HERMES_HOME/plugins/<name>/`.
// Same reason and same shape as `register-mem0-plugin.mjs`.
//
// WHY ALSO `plugins.enabled`. A user plugin stays off until named there. A plugin the
// person switched off (`plugins.disabled`) stays off: the caller checks that first.
//
// The plugin has no Python dependencies and no network or model calls of its own; its
// tests are not copied (they import pytest, which the core venv does not have).

import fs from 'node:fs'
import path from 'node:path'

import { DELEGATION_PLUGIN_DIR } from './hermes-env.mjs'

/** Folder name in the profile = `name` in the plugin's manifest. */
export const DELEGATION_PLUGIN_ID = 'advanced-delegation'

/** What makes up the plugin at the pin; explicit, so tests and caches never travel. */
export const DELEGATION_PLUGIN_FILES = [
  'plugin.yaml',
  '__init__.py',
  'cli.py',
  'model_map.py',
  'profile_routes.py',
  'slash.py',
  'store.py',
  'LICENSE'
]

/**
 * Copies the plugin into `<home>/plugins/advanced-delegation`. Idempotent;
 * `{ changed, missing }`. `missing: true` — no source (setup not run): the profile is
 * left alone and the caller decides what to say.
 */
export function installDelegationPlugin(hermesHomeDir, sourceDir = DELEGATION_PLUGIN_DIR) {
  if (!fs.existsSync(path.join(sourceDir, 'plugin.yaml'))) return { changed: false, missing: true }

  const target = path.join(hermesHomeDir, 'plugins', DELEGATION_PLUGIN_ID)
  fs.mkdirSync(target, { recursive: true })
  let changed = false
  for (const name of DELEGATION_PLUGIN_FILES) {
    const source = fs.readFileSync(path.join(sourceDir, name))
    let existing = null
    try {
      existing = fs.readFileSync(path.join(target, name))
    } catch {
      // not there yet
    }
    if (existing === null || !existing.equals(source)) {
      fs.writeFileSync(path.join(target, name), source)
      changed = true
    }
  }
  return { changed, missing: false }
}

/** True when `plugins.disabled` in this `config.yaml` text names `pluginId`: the
 *  person switched it off, and starting the app must not switch it back on. */
export function isPluginDisabledInConfigYaml(yamlText, pluginId) {
  const lines = yamlText.split(/\r?\n/)
  const start = lines.findIndex((line) => /^plugins:\s*(#.*)?$/.test(line))
  if (start === -1) return false
  let inDisabled = false
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^\S/.test(line)) break
    if (/^ {2}\S/.test(line)) {
      const inline = line.match(/^ {2}disabled:\s*\[(.*)\]\s*(#.*)?$/)
      if (inline) {
        return inline[1]
          .split(',')
          .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
          .includes(pluginId)
      }
      inDisabled = /^ {2}disabled:\s*(#.*)?$/.test(line)
      continue
    }
    if (inDisabled) {
      const item = line
        .trim()
        .replace(/^-\s*/, '')
        .replace(/^['"]|['"]$/g, '')
      if (item === pluginId) return true
    }
  }
  return false
}
