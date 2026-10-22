// Reproducibility and integrity of the shipped runtimes (task T23).
//
// The core cannot be built into a wheel (their `setup.py` refuses), so the unit of
// delivery is the staged payload. Two records, two jobs:
//
// * `runtime/payload/payload-versions.json` — TRACKED in git. Pin, tools and every
//   Python distribution of both payloads, by version. A rebuild from the same pin must
//   reproduce it exactly: `versions --check` after `node runtime/setup.mjs`. Only a
//   deliberate change (a pin raise, a new extra) rewrites it with `versions --write`,
//   and the record's diff goes into the same commit.
// * `<payload>/payload-hashes.json` — SHIPPED inside each payload (`runtime/core`,
//   `runtime/mcp`). SHA-256 of every file as staged. `verify` re-hashes a tree — the
//   working copy or an installed `<root>` — and names what changed or went missing.
//   Bytes are not expected to repeat between builds (bytecode and archive timestamps),
//   so the hashes check an installation, the versions check a build.
//
// Usage:
//   node runtime/payload/payload-hashes.mjs record            after staging (setup.mjs does it)
//   node runtime/payload/payload-hashes.mjs versions [--check | --write] [--runtime <staged dir>]
//   node runtime/payload/payload-hashes.mjs verify [--root <dir>]

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNTIME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const VERSIONS_FILE = path.join(RUNTIME_DIR, 'payload', 'payload-versions.json')
export const HASHES_NAME = 'payload-hashes.json'
export const PAYLOADS = ['core', 'mcp']

/** What never ships, so neither the record nor an installed tree has it: the hash file
 *  itself, their PM's store lock and set-aside trees, the core's uv cache (task T43.1)
 *  (`electron-builder.config.cjs`, RUNTIME_FILTER) and `.gitkeep` (electron-builder
 *  drops it everywhere). */
function ignored(rel) {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  return (
    rel === HASHES_NAME ||
    name === '.gitkeep' ||
    rel === 'tools/.install.lock' ||
    rel.startsWith('tools/.reclaim-') ||
    rel.startsWith('uv-cache/') ||
    rel.startsWith('.build-') ||
    rel.endsWith('.pyc.tmp')
  )
}

function* files(dir, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* files(full, base)
    else if (entry.isFile()) yield path.relative(base, full).split(path.sep).join('/')
  }
}

async function sha256(file) {
  return createHash('sha256')
    .update(await fs.promises.readFile(file))
    .digest('hex')
}

/** Reads in parallel: on Windows every first open of a file waits for the antivirus scan
 *  (~30 ms measured, 2026-10-19), so 87k files one by one take most of an hour. */
async function hashAll(dir, rels, width = 32) {
  const out = new Array(rels.length)
  let next = 0
  async function worker() {
    while (next < rels.length) {
      const at = next++
      out[at] = await sha256(path.join(dir, rels[at]))
    }
  }
  await Promise.all(Array.from({ length: width }, worker))
  return out
}

export async function hashTree(dir) {
  const rels = [...files(dir)].filter((rel) => !ignored(rel)).sort()
  const hashes = await hashAll(dir, rels)
  return Object.fromEntries(rels.map((rel, at) => [rel, hashes[at]]))
}

/** `name -> version` of every `*.dist-info` directly under `site`. */
function distributions(site) {
  const out = {}
  for (const name of fs.readdirSync(site)) {
    const match = /^(.+?)-([^-]+)\.dist-info$/.exec(name)
    if (match) out[match[1].toLowerCase().replace(/[-_.]+/g, '-')] = match[2]
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

export function collectVersions(runtimeDir = RUNTIME_DIR) {
  const core = path.join(runtimeDir, 'core')
  const manifest = JSON.parse(fs.readFileSync(path.join(core, 'manifest.json'), 'utf-8'))
  const facts = JSON.parse(
    fs.readFileSync(path.join(core, 'tools', 'facts.json'), 'utf-8')
  ).packages
  const tools = Object.fromEntries(
    Object.entries(facts)
      .filter(([, fact]) => fact.version)
      .map(([name, fact]) => [name, fact.version])
      .sort(([a], [b]) => a.localeCompare(b))
  )
  const mcp = path.join(runtimeDir, 'mcp', 'python')
  return {
    core: {
      revision: readRevision(core),
      target: manifest.target,
      tools,
      extras: JSON.parse(fs.readFileSync(path.join(core, 'enabled-features.json'), 'utf-8')).extras,
      python: distributions(path.join(core, manifest.runtime.sitePackages))
    },
    mcp: {
      python: /#define PY_VERSION\s+"([^"]+)"/.exec(
        fs.readFileSync(path.join(mcp, 'include', 'patchlevel.h'), 'utf-8')
      )?.[1],
      // python-build-standalone's release the interpreter came from.
      build: fs.readFileSync(path.join(mcp, 'BUILD'), 'utf-8').trim(),
      packages: distributions(path.join(mcp, 'Lib', 'site-packages'))
    }
  }
}

/** The commit the snapshot was cut from (their `publish_prepared` stamps it). */
function readRevision(core) {
  const prepared = path.join(path.dirname(core), 'core.prepared.json')
  for (const file of [prepared, path.join(core, 'manifest.json')]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
      const found = data.revision ?? data.commit ?? data.source?.revision
      if (found) return found
    } catch {
      // not there
    }
  }
  return null
}

export function diffVersions(expected, actual, prefix = '') {
  const lines = []
  for (const key of new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})])) {
    const a = expected?.[key]
    const b = actual?.[key]
    const where = prefix ? `${prefix}.${key}` : key
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      lines.push(...diffVersions(a, b, where))
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      lines.push(`${where}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`)
    }
  }
  return lines
}

export async function verifyTree(dir) {
  const recorded = JSON.parse(fs.readFileSync(path.join(dir, HASHES_NAME), 'utf-8')).files
  const present = Object.keys(recorded).filter((rel) => fs.existsSync(path.join(dir, rel)))
  const found = new Set(present)
  const missing = Object.keys(recorded).filter((rel) => !found.has(rel))
  const hashes = await hashAll(dir, present)
  const changed = present.filter((rel, at) => hashes[at] !== recorded[rel])
  const extra = [...files(dir)].filter((rel) => !ignored(rel) && !(rel in recorded))
  return { checked: Object.keys(recorded).length, changed, missing, extra }
}

function argValue(name) {
  const at = process.argv.indexOf(name)
  return at > 0 ? process.argv[at + 1] : undefined
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  const command = process.argv[2]
  if (command === 'record') {
    for (const name of PAYLOADS) {
      const dir = path.join(RUNTIME_DIR, name)
      const filesHashed = await hashTree(dir)
      fs.writeFileSync(
        path.join(dir, HASHES_NAME),
        `${JSON.stringify({ schema: 1, files: filesHashed }, null, 1)}\n`
      )
      console.log(`${name}: ${Object.keys(filesHashed).length} files hashed`)
    }
  } else if (command === 'versions') {
    const actual = collectVersions(path.resolve(argValue('--runtime') ?? RUNTIME_DIR))
    if (process.argv.includes('--write')) {
      fs.writeFileSync(VERSIONS_FILE, `${JSON.stringify(actual, null, 2)}\n`)
      console.log(`versions -> ${path.relative(process.cwd(), VERSIONS_FILE)}`)
      process.exit(0)
    }
    const expected = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf-8'))
    const diff = diffVersions(expected, actual)
    for (const line of diff) console.log(line)
    console.log(
      diff.length
        ? `${diff.length} difference(s) from the tracked record`
        : 'versions match the tracked record'
    )
    if (process.argv.includes('--check') && diff.length) process.exit(1)
  } else if (command === 'verify') {
    const root = path.resolve(argValue('--root') ?? path.dirname(RUNTIME_DIR))
    let bad = 0
    for (const name of PAYLOADS) {
      const result = await verifyTree(path.join(root, 'runtime', name))
      bad += result.changed.length + result.missing.length
      console.log(
        `${name}: ${result.checked} checked, ${result.changed.length} changed, ${result.missing.length} missing, ${result.extra.length} extra`
      )
      for (const rel of [...result.changed, ...result.missing].slice(0, 20)) console.log(`  ${rel}`)
      for (const rel of result.extra.slice(0, 10)) console.log(`  + ${rel}`)
    }
    process.exit(bad ? 1 : 0)
  } else {
    console.error(
      'usage: payload-hashes.mjs record | versions [--check | --write] [--runtime <dir>] | verify [--root <dir>]'
    )
    process.exit(2)
  }
}
