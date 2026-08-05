// Hermes parity check (task 1.5.D1 / D1.9).
//
// Prints which tui_gateway events the installed hermes UI reacts to but our
// chat does not. Run it after every hermes upgrade — a new event family is
// how a Hermes feature silently fails to exist in our app.
//
// Why read their UI statically instead of probing a live gateway: hermes ships
// its real UI as an Ink/React app (their "desktop" is a shell around that
// terminal UI, see hermes_cli/web_dist, which just embeds it via xterm.js).
// The event names are plain string literals, so a static read is deterministic
// and instant, while provoking a live clarify/secret/sudo round-trip would need
// a real model and would be flaky.
//
// Two places that UI can be read from, in order:
//   1. `ui-tui/src` in the core checkout — the source. Since 0.20.0 the install
//      is editable (their build backend refuses to build a wheel), so this is
//      what we actually have, and it is the more readable of the two.
//   2. `hermes_cli/tui_dist/entry.js` — the built bundle a packaged install
//      carried. Kept as a fallback for the day a normal install works again;
//      the names survive minification.
//
// Usage:  node runtime/hermes-event-diff.mjs
// Exit code is always 0 — this is an informational report, not a gate.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HERMES_SRC_DIR, VENV_DIR } from './hermes-env.mjs'

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(RUNTIME_DIR, '..')

const TUI_SOURCE_DIR = path.join(HERMES_SRC_DIR, 'ui-tui', 'src')
const TUI_BUNDLE = path.join(VENV_DIR, 'Lib', 'site-packages', 'hermes_cli', 'tui_dist', 'entry.js')
const CHAT_STATE = path.join(
  REPO_ROOT,
  'apps',
  'desktop',
  'src',
  'renderer',
  'src',
  'chat',
  'chat-state.ts'
)

// Event families we treat as "chat surface". Anything outside these is noise
// from the bundle (module ids, mime types, ...). Extend when hermes grows a
// new family — the unmatched-token dump below is there to make that visible.
const EVENT_FAMILIES = new Set([
  'message',
  'tool',
  'thinking',
  'reasoning',
  'approval',
  'clarify',
  'secret',
  'sudo',
  'subagent',
  'moa',
  'notification',
  'status',
  'input'
])

/** Pulls the string entries out of an `export const NAME = [...] as const`. */
function readListFromSource(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\]`))
  if (!match) throw new Error(`could not find ${name} in chat-state.ts`)
  return [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
}

/** Names that LOOK like events in their bundle but are not inbound events, so
 * counting them as parity gaps produces a warning that can never be resolved
 * (task 1.6.B5.28). Each is checked in their source, not guessed:
 *
 * - `subagent.interrupt` — an RPC method (`@method("subagent.interrupt")` in
 *   tui_gateway/server.py), i.e. something a client CALLS;
 * - `tool.progress` — the name of an internal core callback
 *   (`_on_tool_progress`), which translates it into the events we do handle
 *   (reasoning.available / moa.* / subagent.*) and emits nothing under this
 *   name at all.
 */
const NOT_INBOUND_EVENTS = new Set(['subagent.interrupt', 'tool.progress'])

/** Event-shaped string literals in the hermes bundle (it is minified with
 * backticks, so all three quote styles are accepted). */
function readHermesEvents(bundle) {
  const found = new Set()
  for (const m of bundle.matchAll(/['"`]([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)['"`]/g)) {
    // `*.respond` is an outgoing RPC method we CALL, not an inbound event to
    // handle — counting it as a gap would be pure noise.
    if (m[2] === 'respond') continue
    if (NOT_INBOUND_EVENTS.has(`${m[1]}.${m[2]}`)) continue
    if (EVENT_FAMILIES.has(m[1])) found.add(`${m[1]}.${m[2]}`)
  }
  return found
}

/** Every .ts/.tsx file under their TUI source, concatenated. */
function readTuiSource(dir) {
  const parts = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) parts.push(readTuiSource(full))
    else if (/\.tsx?$/.test(entry.name)) parts.push(fs.readFileSync(full, 'utf8'))
  }
  return parts.join('\n')
}

let theirUi
let readFrom
if (fs.existsSync(TUI_SOURCE_DIR)) {
  theirUi = readTuiSource(TUI_SOURCE_DIR)
  readFrom = path.relative(REPO_ROOT, TUI_SOURCE_DIR)
} else if (fs.existsSync(TUI_BUNDLE)) {
  theirUi = fs.readFileSync(TUI_BUNDLE, 'utf8')
  readFrom = path.relative(REPO_ROOT, TUI_BUNDLE)
} else {
  console.error(`hermes TUI not found — looked for:\n  ${TUI_SOURCE_DIR}\n  ${TUI_BUNDLE}`)
  console.error('Is the core installed? (run `node runtime/setup.mjs`)')
  process.exit(0)
}

const source = fs.readFileSync(CHAT_STATE, 'utf8')
const handled = new Set(readListFromSource(source, 'HANDLED_GATEWAY_EVENTS'))
const ignored = new Set(readListFromSource(source, 'IGNORED_GATEWAY_EVENTS'))
const theirs = readHermesEvents(theirUi)

const missing = [...theirs].filter((e) => !handled.has(e) && !ignored.has(e)).sort()
const ours = [...handled].sort()
const notInTheirs = ours.filter((e) => !theirs.has(e))

console.log(`read from               : ${readFrom}`)
console.log(`hermes TUI events found : ${theirs.size}`)
console.log(`handled by our chat     : ${handled.size}`)
console.log(`deliberately ignored    : ${ignored.size}`)

if (missing.length === 0) {
  console.log('\nNo parity gap: every hermes chat event is handled or ignored on purpose.')
} else {
  console.log(`\nNOT handled by us (${missing.length}) — each is a potential missing feature:`)
  for (const e of missing) console.log(`  - ${e}`)
  console.log('\nBlocking ones stall the agent until they time out; see specs/agent-chat.md.')
}

if (notInTheirs.length > 0) {
  console.log(`\nWe handle these, their TUI bundle does not mention them (${notInTheirs.length}):`)
  for (const e of notInTheirs) console.log(`  - ${e}`)
  console.log('Usually fine (aliases, or our own additions) — worth a glance after an upgrade.')
}
