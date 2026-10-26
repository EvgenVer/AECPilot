// Registers the `aec-roster` MCP server — the tool one specialist uses to ask
// another (task 3C.7, contract docs/history/specs/agent-roster.md §Р6).
//
// TWO THINGS SET THIS APART from register-aec-sources / register-aec-rag, and
// both follow from what the tool is for:
//
//   1. IT GOES INTO EVERY PROFILE, not just the default one. `@name` is asked
//      from whichever specialist the person is talking to, so the tool has to
//      exist in that specialist's own config.yaml. Profiles do not inherit
//      config from the default one (measured: `hermes_cli/profiles.py`
//      `create_profile` copies config.yaml only when cloning, and our create
//      dialog defaults to no clone), so registration walks
//      `<home>/config.yaml` plus every `<home>/profiles/*/config.yaml`.
//   2. IT IS HANDED A ROSTER SNAPSHOT, not a token. The tool has to turn the
//      name a person typed ("Смета") into a profile name (`smeta`), and that
//      mapping lives in the profile's `ui_meta` — reachable only through the
//      gateway (measured: `ui_meta` appears nowhere outside `tui_gateway/**`
//      in the core at 0.20.5; no CLI command reads it). The gateway token is
//      deliberately NOT given to this server (§Р6 rule 4), so the side that
//      owns the roster writes it out as a file and the tool reads that. Same
//      shape as `aec-sources --project <project.json>`.
//
// The `hermes` executable AND the core's home are passed by path for the same
// reason `aec-rag` gets AEC_HERMES_HOME as a literal: the core strips its
// environment before spawning an MCP child (`tools/mcp_tool._build_safe_env`,
// whose allowlist has no HERMES_HOME — measured). Our core lives in an isolated
// venv that is on nobody's PATH, and without the home the tool would talk to
// `~/.hermes` — the person's own install, outside this workspace entirely.
// Paths, not secrets.
//
// Usage:
//   node runtime/register-aec-roster.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RUNTIME_DIR, HERMES_HOME_DIR, HERMES_BIN, mcpServerCommand } from './hermes-env.mjs'
import { mergeMcpServerIntoConfigYaml } from './register-aec-sources.mjs'


// Development: the workspace's console script; installed: `python -m aec_roster`
// with our staged interpreter (hermes-env.mjs::mcpServerCommand, task T22).
const AEC_ROSTER_COMMAND = mcpServerCommand('aec-roster')
export const AEC_ROSTER_BIN = AEC_ROSTER_COMMAND.command
export const AEC_ROSTER_ARGS = AEC_ROSTER_COMMAND.args

/** The roster snapshot the app maintains, read by the tool at every call.
 * Lives next to the core's own settings because that is where the core
 * machine's state belongs — and because with a remote core it is the core
 * machine that has to hold it. */
export const ROSTER_SNAPSHOT_PATH = path.join(HERMES_HOME_DIR, 'aecpilot-roster.json')

/**
 * Every profile's config.yaml on this install: the default profile's, plus one
 * per named profile. A named profile with no config.yaml yet still gets its
 * path back — the merge creates the file, which is what registering into a
 * freshly created specialist means.
 */
export function profileConfigPaths(homeDir) {
  const configs = [path.join(homeDir, 'config.yaml')]

  let named = []
  try {
    named = fs.readdirSync(path.join(homeDir, 'profiles'), { withFileTypes: true })
  } catch {
    // No named profiles yet — the default profile is the whole roster.
    return configs
  }

  for (const entry of named) {
    if (entry.isDirectory()) {
      configs.push(path.join(homeDir, 'profiles', entry.name, 'config.yaml'))
    }
  }
  return configs
}

/**
 * Writes `mcp_servers.aec-roster` into every profile on this install.
 * Returns `{ changed, configPaths }`; `changed` is what tells the caller a
 * `reload.mcp` is worth doing.
 */
export function registerAecRoster({ homeDir = HERMES_HOME_DIR, hermesBin = HERMES_BIN } = {}) {
  if (!fs.existsSync(AEC_ROSTER_BIN)) {
    throw new Error(`aec-roster binary not found at ${AEC_ROSTER_BIN} — run 'uv sync' first`)
  }

  const configPaths = profileConfigPaths(homeDir)
  let changed = false

  for (const configPath of configPaths) {
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : ''
    const merged = mergeMcpServerIntoConfigYaml(existing, 'aec-roster', {
      command: AEC_ROSTER_BIN,
      args: [...AEC_ROSTER_ARGS, '--roster', ROSTER_SNAPSHOT_PATH, '--hermes', hermesBin, '--home', homeDir],
      enabled: true
    })
    if (!merged.changed) continue

    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, merged.text, 'utf-8')
    changed = true
  }

  return { changed, configPaths }
}

/**
 * Writes the roster snapshot the tool reads. Only the two fields it needs:
 * the profile name it will call, and the name a person calls the specialist
 * by. Nothing about looks, sessions or anything else — a file that carries
 * more than its reader needs is a file that leaks.
 *
 * Returns true when the file changed, so the caller can stay quiet on the
 * usual case (the roster is re-read often; it rarely differs).
 */
export function writeRosterSnapshot(specialists, snapshotPath = ROSTER_SNAPSHOT_PATH, now = Date.now) {
  const rows = specialists.map((one) => ({ name: one.name, title: one.title ?? '' }))
  const body = JSON.stringify({ specialists: rows }, null, 2) + '\n'

  let existing = ''
  try {
    existing = fs.readFileSync(snapshotPath, 'utf-8')
  } catch {
    // No snapshot yet — writing one is the whole point.
  }

  // Task 3D.4: the snapshot carries WHEN it was taken, and the freshness stamp
  // is refreshed even when the roster itself did not change.
  //
  // Why the stamp is separate from the content comparison: an unchanged roster
  // must not rewrite the file (that would restart the MCP server for nothing),
  // but the reader still has to tell "nobody added a specialist" from "nobody
  // is writing this file any more". Those look identical without a heartbeat,
  // and after the roster moved to their plugin the second case is exactly the
  // failure this task exists to prevent. So an unchanged roster only touches
  // the stamp file next to the snapshot — cheap, and it never restarts MCP.
  const stampPath = `${snapshotPath}.seen`
  const stamp = `${new Date(now()).toISOString()}\n`
  try {
    fs.mkdirSync(path.dirname(stampPath), { recursive: true })
    fs.writeFileSync(stampPath, stamp, 'utf-8')
  } catch {
    // A missing stamp degrades the reader to "cannot tell how fresh this is",
    // which it handles — it must never stop the snapshot itself from landing.
  }

  if (existing === body) return false

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  fs.writeFileSync(snapshotPath, body, 'utf-8')
  return true
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isMain) {
  const result = registerAecRoster()
  console.log(`== aec-roster registered (changed=${result.changed})`)
  for (const configPath of result.configPaths) console.log(`   ${configPath}`)
  console.log(`== roster snapshot: ${ROSTER_SNAPSHOT_PATH}`)
}
