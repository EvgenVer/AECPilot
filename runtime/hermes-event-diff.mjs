// Hermes parity check (task 1.5.D1 / D1.9).
//
// Prints which tui_gateway events the installed hermes UI reacts to but our
// chat does not. Run it after every hermes upgrade — a new event family is
// how a Hermes feature silently fails to exist in our app.
//
// Why parse their bundle instead of probing a live gateway: hermes ships its
// real UI as a built Ink/React bundle (hermes_cli/tui_dist/entry.js — their
// "desktop" is a shell around that terminal UI, see hermes_cli/web_dist,
// which just embeds it via xterm.js). The event names survive minification as
// plain string literals, so a static read is deterministic and instant, while
// provoking a live clarify/secret/sudo round-trip would need a real model and
// would be flaky.
//
// Usage:  node runtime/hermes-event-diff.mjs
// Exit code is always 0 — this is an informational report, not a gate.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(RUNTIME_DIR, '..')

const TUI_BUNDLE = path.join(
  RUNTIME_DIR,
  '.hermes-venv',
  'Lib',
  'site-packages',
  'hermes_cli',
  'tui_dist',
  'entry.js'
)
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

/** Event-shaped string literals in the hermes bundle (it is minified with
 * backticks, so all three quote styles are accepted). */
function readHermesEvents(bundle) {
  const found = new Set()
  for (const m of bundle.matchAll(/['"`]([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)['"`]/g)) {
    // `*.respond` is an outgoing RPC method we CALL, not an inbound event to
    // handle — counting it as a gap would be pure noise.
    if (m[2] === 'respond') continue
    if (EVENT_FAMILIES.has(m[1])) found.add(`${m[1]}.${m[2]}`)
  }
  return found
}

if (!fs.existsSync(TUI_BUNDLE)) {
  console.error(`hermes TUI bundle not found: ${TUI_BUNDLE}`)
  console.error('Is the hermes venv installed? (runtime/.hermes-venv)')
  process.exit(0)
}

const source = fs.readFileSync(CHAT_STATE, 'utf8')
const handled = new Set(readListFromSource(source, 'HANDLED_GATEWAY_EVENTS'))
const ignored = new Set(readListFromSource(source, 'IGNORED_GATEWAY_EVENTS'))
const theirs = readHermesEvents(fs.readFileSync(TUI_BUNDLE, 'utf8'))

const missing = [...theirs].filter((e) => !handled.has(e) && !ignored.has(e)).sort()
const ours = [...handled].sort()
const notInTheirs = ours.filter((e) => !theirs.has(e))

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
