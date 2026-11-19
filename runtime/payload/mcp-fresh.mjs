// Keeps the staged MCP interpreter (`runtime/mcp`) in step with our sources in a
// development checkout (technical debt of 2026-11-18, owner decision 2026-11-19).
//
// With the payload staged, the app runs `aec-rag` (indexing, scan, graph) and the MCP
// servers from `runtime/mcp/python`, not from `.venv` (`aec-rag-command.ts`,
// `hermes-env.mjs`) — development runs the same payload a person installs. That copy is
// written only by `stage-mcp.mjs`, so an edit under `mcp/` silently did not reach the
// app: on 2026-11-18 the copy was from 13.11 and indexing failed on a T80 fix it lacked.
//
// `pnpm dev`, `pnpm app` and the e2e scripts run this first. It fingerprints the sources
// of our three packages and compares the fingerprint with the one stamped when the copy
// was last brought up to date (`runtime/mcp.sources.json`, not shipped). When they
// differ it reinstalls only our packages into the copy (no dependency changes), bakes
// their bytecode the way staging does, re-records the payload hashes and stamps.
// Without a staged copy (no payload) it does nothing: the app runs `.venv`.
//
// Usage: node runtime/payload/mcp-fresh.mjs [--stamp]
//   --stamp  only record the current fingerprint (after a full staging, setup.mjs)

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { recordPayload } from './payload-hashes.mjs'

const RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(RUNTIME_DIR, '..')

/** Same list as `stage-mcp.mjs` (kept here so this file needs nothing else from it). */
export const MCP_PACKAGES = ['mcp/aec_sources', 'mcp/aec_rag', 'mcp/aec_roster']
export const STAMP_NAME = 'mcp.sources.json'

function* sourceFiles(dir, base) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(full, base)
    else if (entry.isFile() && !entry.name.endsWith('.pyc'))
      yield path.relative(base, full).split(path.sep).join('/')
  }
}

/** SHA-256 over what an install of our packages takes: each `pyproject.toml` and `src/`. */
export function sourcesFingerprint(repo = REPO_ROOT, packages = MCP_PACKAGES) {
  const hash = createHash('sha256')
  for (const pkg of packages) {
    const root = path.join(repo, pkg)
    const rels = ['pyproject.toml', ...sourceFiles(path.join(root, 'src'), root)]
      .filter((rel) => fs.existsSync(path.join(root, rel)))
      .sort()
    for (const rel of rels) {
      hash.update(`${pkg}/${rel}\0`)
      hash.update(fs.readFileSync(path.join(root, rel)))
      hash.update('\0')
    }
  }
  return hash.digest('hex')
}

export function stagedPython(runtimeDir = RUNTIME_DIR) {
  return process.platform === 'win32'
    ? path.join(runtimeDir, 'mcp', 'python', 'python.exe')
    : path.join(runtimeDir, 'mcp', 'python', 'bin', 'python3')
}

function sitePackages(python) {
  if (process.platform === 'win32') return path.join(path.dirname(python), 'Lib', 'site-packages')
  const lib = path.join(path.dirname(path.dirname(python)), 'lib')
  const version = fs.readdirSync(lib).find((name) => /^python3\.\d+$/.test(name))
  return path.join(lib, version ?? 'python3', 'site-packages')
}

function stampPath(runtimeDir) {
  return path.join(runtimeDir, STAMP_NAME)
}

export function readStamp(runtimeDir = RUNTIME_DIR) {
  try {
    return JSON.parse(fs.readFileSync(stampPath(runtimeDir), 'utf-8')).fingerprint ?? null
  } catch {
    return null
  }
}

export function writeStamp(fingerprint, runtimeDir = RUNTIME_DIR) {
  fs.writeFileSync(
    stampPath(runtimeDir),
    `${JSON.stringify({ fingerprint, at: new Date().toISOString() }, null, 1)}\n`
  )
}

/** `uv` from PATH, else its default install place (it is not on PATH everywhere). */
function uvCommand() {
  const probe = spawnSync('uv', ['--version'], { stdio: 'ignore' })
  if (!probe.error) return 'uv'
  const local = path.join(
    os.homedir(),
    '.local',
    'bin',
    process.platform === 'win32' ? 'uv.exe' : 'uv'
  )
  return fs.existsSync(local) ? local : 'uv'
}

function defaultRun(command, args) {
  console.log(`+ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: REPO_ROOT })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`)
}

/**
 * Brings the staged copy up to date when its stamp does not match the sources.
 * Returns `'no-payload' | 'fresh' | 'refreshed'`.
 */
export async function ensureFresh({
  repo = REPO_ROOT,
  runtimeDir = RUNTIME_DIR,
  run = defaultRun,
  record = (name) => recordPayload(name, runtimeDir),
  uv = uvCommand
} = {}) {
  const python = stagedPython(runtimeDir)
  if (!fs.existsSync(python)) return 'no-payload'
  const fingerprint = sourcesFingerprint(repo)
  if (readStamp(runtimeDir) === fingerprint) return 'fresh'

  console.log('runtime/mcp: our MCP packages changed since the copy was made, refreshing it')
  run(uv(), ['pip', 'install', '--python', python, '--no-deps', '--reinstall', ...MCP_PACKAGES])
  // Console-script exes carry this machine's path; staging prunes them (stage-mcp.mjs).
  if (process.platform === 'win32') {
    fs.rmSync(path.join(path.dirname(python), 'Scripts'), { recursive: true, force: true })
  }
  const site = sitePackages(python)
  const modules = MCP_PACKAGES.map((pkg) => pkg.split('/').pop())
  // Same bytecode as staging bakes (stage-mcp.mjs `bakeBytecode`), only for our packages.
  run(python, [
    '-I',
    '-c',
    [
      'import compileall, py_compile, sys',
      'for d in sys.argv[1:]:',
      '    compileall.compile_dir(d, quiet=2, force=True, workers=0,',
      '        invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH)',
      `print('bytecode baked')`
    ].join('\n'),
    ...modules.map((mod) => path.join(site, mod))
  ])
  for (const mod of modules) run(python, ['-I', '-c', `import ${mod}.server; print('${mod} ok')`])
  await record('mcp')
  writeStamp(fingerprint, runtimeDir)
  return 'refreshed'
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  if (process.argv.includes('--stamp')) {
    writeStamp(sourcesFingerprint())
    console.log('runtime/mcp: sources fingerprint stamped')
  } else {
    const state = await ensureFresh()
    if (state === 'refreshed') console.log('runtime/mcp: refreshed')
  }
}
