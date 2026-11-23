// Probe for task T90 (UR57): the agent backup to a file, on the real core.
//
// What the window does, step by step, without the window: `POST /api/ops/backup` with no
// `output` (our bridge refuses one), then `GET /api/actions/backup/status` until the spawned
// `hermes backup` exits. The probe then reads the archive the way the person would after saving
// it: does it open, does it hold the profile (config, memory, skills, sessions, profiles), and
// does it hold nothing from outside the core's home — a file put next to the home on purpose
// must not be in it, nor anything a junction inside the home points to.
//
// SAFETY. Run it only with `AEC_HERMES_HOME` pointing at a temporary copy of
// `runtime/e2e-profile` (without it the core home is `runtime/dev-profile`, the owner's
// manual-acceptance profile — the probe refuses to start then). It removes only the archive
// it created and the marker file it put next to the home.
//
// Usage: AEC_HERMES_HOME=<temp copy> node runtime/backup-probe.mjs
// Needs no API key: nothing here asks a model anything.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { VENV_DIR } from './hermes-env.mjs'
import { HERMES_HOME_DIR, startServe, stopServe, waitHealthy } from './serve.mjs'

const PORT = 18996

const OWNER_PROFILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dev-profile')
if (!process.env.AEC_HERMES_HOME || path.resolve(process.env.AEC_HERMES_HOME).toLowerCase() === OWNER_PROFILE.toLowerCase()) {
  console.error('backup-probe: set AEC_HERMES_HOME to a temporary copy of runtime/e2e-profile')
  process.exit(2)
}

async function rest(handle, route, { method = 'GET', body } = {}) {
  const response = await fetch(`http://${handle.host}:${handle.port}${route}`, {
    method,
    headers: {
      'X-Hermes-Session-Token': handle.token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await response.text()
  try {
    return { status: response.status, body: text === '' ? null : JSON.parse(text) }
  } catch {
    return { status: response.status, body: text }
  }
}

/** Lists the archive with the core's own Python: entry names and sizes, plus the
 * zip's own integrity check. */
function listArchive(archive) {
  const python = path.join(VENV_DIR, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  const script =
    'import json,sys,zipfile\n' +
    'z=zipfile.ZipFile(sys.argv[1])\n' +
    'print(json.dumps({"bad":z.testzip(),"entries":[[i.filename,i.file_size] for i in z.infolist()]}))\n'
  const r = spawnSync(python, ['-I', '-c', script, archive], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`zip listing failed: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Foreign data: a folder OUTSIDE the home with a marker file, reached from inside the home
// through a junction (what a linked project folder looks like). The backup must not follow it.
const foreign = fs.mkdtempSync(path.join(path.dirname(HERMES_HOME_DIR), 'aec-t90-foreign-'))
fs.writeFileSync(path.join(foreign, 'aec-t90-foreign-marker.txt'), 'must not enter the backup')
const junction = path.join(HERMES_HOME_DIR, 'aec-t90-linked-folder')
fs.symlinkSync(foreign, junction, 'junction')

let archive = null
const handle = await startServe({ port: PORT })
try {
  await waitHealthy(handle)

  const started = await rest(handle, '/api/ops/backup', { method: 'POST', body: {} })
  archive = started.body?.archive ?? null
  check('POST /api/ops/backup starts a backup and names the archive', started.status === 200 && !!archive, JSON.stringify(started.body))

  let status = null
  for (let i = 0; i < 240; i += 1) {
    status = await rest(handle, '/api/actions/backup/status')
    if (status.body && status.body.running === false) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  check('hermes backup exits 0', status?.body?.exit_code === 0, `exit_code=${status?.body?.exit_code}`)

  const inBackups = !!archive && path.dirname(path.resolve(archive)) === path.join(path.resolve(HERMES_HOME_DIR), 'backups')
  check('the archive lies in <home>/backups (what the save bridge accepts)', inBackups, archive ?? '')
  check('the archive name matches hermes-backup-*.zip', /^hermes-backup-[A-Za-z0-9-]+\.zip$/.test(path.basename(archive ?? '')))

  const listing = listArchive(archive)
  const names = listing.entries.map(([name]) => name.replace(/\\/g, '/'))
  const bytes = listing.entries.reduce((sum, [, size]) => sum + size, 0)
  check('the archive opens and passes the zip integrity check', listing.bad === null, `${names.length} entries, ${(bytes / 1048576).toFixed(1)} MiB unpacked`)

  for (const expected of ['config.yaml', 'state.db']) {
    check(`it holds ${expected}`, names.some((n) => n === expected || n.endsWith(`/${expected}`)))
  }
  for (const folder of ['memories/', 'skills/']) {
    check(`it holds ${folder}`, names.some((n) => n.startsWith(folder) || n.includes(`/${folder}`)))
  }

  check('nothing from outside the home (a junction to a foreign folder is not followed)', !names.some((n) => n.includes('aec-t90-foreign-marker')))
  check('no absolute paths or parent steps in entry names', !names.some((n) => n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.split('/').includes('..')))
  check('no earlier backups nested inside', !names.some((n) => n.split('/').includes('backups')))

  const top = new Map()
  for (const [name, size] of listing.entries) {
    const head = name.replace(/\\/g, '/').split('/')[0]
    top.set(head, (top.get(head) ?? 0) + size)
  }
  console.log('top-level entries (unpacked KiB):')
  for (const [head, size] of [...top].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${head}  ${(size / 1024).toFixed(0)}`)
  }
} finally {
  await stopServe(handle)
  if (archive) fs.rmSync(archive, { force: true })
  // The link only, never what it points to: `rmdir` on a junction removes the link itself.
  if (fs.existsSync(junction)) fs.rmdirSync(junction)
  fs.rmSync(foreign, { recursive: true, force: true })
}

const failed = checks.filter((c) => !c.ok).length
console.log(`${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
