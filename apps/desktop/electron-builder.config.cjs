// The electron-builder configuration of the Windows installer and the portable zip
// (task T22, strategy: docs/plan-details.md §«Упаковка и поставка (фаза 3, задача T21)»).
//
// One folder holds everything (SPEC UR40): the app is `<root>/AECPilot.exe` +
// `<root>/resources/app.asar`, our runtime layer sits NEXT to the exe at
// `<root>/runtime` (`extraFiles`, not `extraResources`) — the main process and
// `runtime/hermes-env.mjs` both find it four levels up from `out/main`, which is
// `<root>` in a working copy and in the installed tree alike.
//
// `runtime/` carries the two staged payloads (`runtime/core` — the core built by their
// PM, `runtime/mcp` — our Python 3.12 for the MCP servers; `node runtime/setup.mjs`
// stages both) and our `.mjs` layer, which needs nothing but Node built-ins. The
// development runtime (`.hermes-venv`, `.hermes-src`), both test profiles and the
// probes stay out.
//
// Windows: NSIS with a folder the person chooses (T38) and a zip of the same tree as
// the portable build — electron-builder's `portable` target would unpack ~3 GB into
// %TEMP% at every start (T21). No signing on the MVP (SPEC A7).
// @ts-check
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const { writeInstalledEntries } = require('./installed-entries.cjs')
const { readOwner, writeThirdPartyNotices } = require('./third-party-notices.cjs')

const repo = path.resolve(__dirname, '..', '..')
const electronPackage = require(require.resolve('electron/package.json', { paths: [__dirname] }))
// T43.2 (SPEC A8): the copyright holder from package.json `aecpilot.copyrightHolder`.
const owner = readOwner(__dirname)

/** What the main process loads from `node_modules` at run time: `import('exceljs')`
 *  (sheet-read) and `import('get-windows')` (os-windows) — everything else in
 *  `dependencies` is the renderer's, already inside the vite bundle. Left to itself,
 *  electron-builder packs every production dependency into app.asar: 66 000 files,
 *  ~450 MB (measured 2026-10-17, T22). */
const MAIN_RUNTIME_PACKAGES = ['exceljs', 'get-windows']

/** get-windows' toolchain for building its addon from source — optional
 *  dependencies that never load: the addon ships prebuilt (`npmRebuild: false`). */
const BUILD_ONLY_PACKAGES = new Set(['node-gyp', 'node-addon-api'])

/** The folder of package `name` as Node finds it from `from`: the nearest
 *  `node_modules/<name>` up the tree (a package's `exports` may hide its package.json
 *  from `require.resolve`). `null` — an optional dependency this platform skipped. */
function findPackageDir(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'))
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate)
    if (path.dirname(dir) === dir) return null
  }
}

/**
 * Lays those packages and everything they load — `dependencies` and
 * `optionalDependencies` (get-windows finds its binary through the optional
 * `@mapbox/node-pre-gyp`) — out as a `node_modules` tree that Node resolves the way the
 * workspace does, and returns one copy entry per package. The copies come from pnpm's
 * store, so the versions are the lockfile's, the ones the tests run.
 *
 * Placement follows Node's lookup: the first version met goes to the top level; a
 * different version of the same name goes into the `node_modules` of the package that
 * asks for it (the closure has six such pairs: archiver-utils, minimatch, …).
 */
function runtimeModules(roots) {
  /** location ("" = top level, else "a/node_modules/b") -> Map(name -> real dir) */
  const placed = new Map([['', new Map()]])
  const copies = []
  const resolvedAt = (location, name) => {
    for (let at = location; ;) {
      const hit = placed.get(at)?.get(name)
      if (hit) return hit
      if (at === '') return null
      const cut = at.lastIndexOf('/node_modules/')
      at = cut === -1 ? '' : at.slice(0, cut)
    }
  }
  const place = (name, realDir, location) => {
    // `location` is the folder of the requiring package inside node_modules ('' = app).
    if (resolvedAt(location, name) === realDir) return
    const top = placed.get('')
    const at = top.has(name) ? location : ''
    if (!placed.has(at)) placed.set(at, new Map())
    placed.get(at).set(name, realDir)
    const own = at === '' ? name : `${at}/node_modules/${name}`
    placed.set(own, placed.get(own) ?? new Map())
    copies.push({ from: realDir, to: `node_modules/${own}`, filter: ['**/*', '!node_modules/**'] })
    const pkg = JSON.parse(fs.readFileSync(path.join(realDir, 'package.json'), 'utf-8'))
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      if (BUILD_ONLY_PACKAGES.has(dep)) continue
      const depDir = findPackageDir(dep, realDir)
      if (depDir) place(dep, depDir, own)
    }
  }
  for (const name of roots) place(name, findPackageDir(name, __dirname), '')
  return copies
}

/** Our `.mjs` layer and the data it reads at run time — not the dev tooling. */
const RUNTIME_FILTER = [
  '*.mjs',
  '!*.test.mjs',
  '!*-probe.mjs',
  '!*-probe.py',
  'memory-facts.py',
  'mem0-plugin-requirements.txt',
  'bin/**',
  'templates/**',
  'fixtures/demo-source/**',
  'fixtures/demo-vault/**',
  'core/**',
  '!core/.build-*/**',
  // Their PM's set-aside trees and store lock (stage_core.py::drop_set_aside).
  '!core/tools/.reclaim-*/**',
  '!core/tools/.install.lock',
  // A second copy of the core's own dependencies, for PM to rebuild an environment
  // without network — only when the person turns on a core plugin with Python
  // dependencies of its own. Without it PM downloads what that plugin needs
  // (`pm/packages.py::uv_cache_dir` handles an image without one). ~8 400 files the
  // product never reads otherwise (task T43.1, owner decision 2026-10-22). Their
  // assembler requires the folder, so it stays in the staged `runtime/core`.
  '!core/uv-cache/**',
  'mcp/**',
  // The Mem0 plugin's source at its pin, copied into the profile at start
  // (`register-mem0-plugin.mjs` reads it from this very relative path).
  '.mem0-plugin-src/integrations/hermes-plugin-mem0/**',
  '!.mem0-plugin-src/integrations/hermes-plugin-mem0/tests/**',
  // Our scripts' caches only: `core/**/__pycache__` is the bytecode their PM bakes
  // (`bake_bytecode`) and ships on purpose.
  '!bin/__pycache__/**',
  '!.mem0-plugin-src/**/__pycache__/**'
]

/** @type {import('app-builder-lib').Configuration} */
module.exports = {
  appId: 'org.aecpilot.desktop',
  productName: 'AECPilot',
  executableName: 'AECPilot',
  artifactName: 'AECPilot-${version}-${os}-${arch}.${ext}',
  copyright: `© ${new Date().getFullYear()} ${owner.holder || 'AECPilot'}`,
  electronVersion: electronPackage.version,
  // The Electron the tests run on, not a second download of it.
  electronDist: path.join(
    path.dirname(require.resolve('electron/package.json', { paths: [__dirname] })),
    'dist'
  ),
  directories: { output: 'release', buildResources: 'build' },
  // electron-builder's own collection is turned off by `!node_modules/**`; the runtime
  // tree is copied package by package instead (`runtimeModules`).
  files: ['out/**', 'package.json', '!node_modules/**', ...runtimeModules(MAIN_RUNTIME_PACKAGES)],
  // Our one native module, `get-windows`, ships N-API 9 prebuilds (`lib/binding/napi-9-
  // win32-unknown-x64`) that load in any Electron — the same file the tests run. A rebuild
  // would need Visual Studio and gains nothing.
  npmRebuild: false,
  asar: true,
  asarUnpack: ['**/*.node', '**/prebuilds/**'],
  extraFiles: [
    // T43.2 (SPEC A8): the program's own license, next to THIRD-PARTY-NOTICES.txt.
    { from: path.join(repo, 'LICENSE.txt'), to: 'LICENSE.txt' },
    { from: path.join(repo, 'runtime'), to: 'runtime', filter: RUNTIME_FILTER },
    { from: path.join(repo, 'skills'), to: 'skills', filter: ['**/*', '!**/__pycache__/**'] },
    {
      from: path.join(repo, 'plugins'),
      to: 'plugins',
      filter: ['**/*', '!**/__pycache__/**', '!**/tests/**']
    }
  ],
  publish: null,
  // T43.2: THIRD-PARTY-NOTICES.txt is written into the packed tree first, so the list
  // below has it. T30.1: the uninstaller removes only what is packed here
  // (installed-entries.cjs); build/installer.nsh includes the list this writes.
  afterPack: (context) => {
    if (context.electronPlatformName !== 'win32') return
    const license = fs.readFileSync(path.join(context.appOutDir, 'LICENSE.txt'), 'utf-8')
    if (!owner.holder || !license.includes(owner.holder)) {
      throw new Error('LICENSE.txt must name aecpilot.copyrightHolder of package.json (T43.2)')
    }
    writeThirdPartyNotices(context.appOutDir, __dirname)
    writeInstalledEntries(
      context.appOutDir,
      context.packager.info.buildResourcesDir,
      context.packager.appInfo.productFilename
    )
  },
  win: {
    target: ['nsis', 'zip'],
    // Unsigned on the MVP (SPEC A7): no certificate is configured, so nothing is signed;
    // the exe still gets our name and version stamped into its resources.
    signAndEditExecutable: true
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'AECPilot',
    // Our page strings (build/installer.nsh) exist in these two; the language follows
    // the OS, no selector (T30).
    installerLanguages: ['en_US', 'ru_RU']
  }
}
