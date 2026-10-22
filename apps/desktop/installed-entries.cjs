// What the uninstaller removes — task T30.1 (security review of phase 3, 2026-10-21).
//
// The uninstaller used to remove everything in the install folder except `data`. That
// is the template's own `RMDir /r $INSTDIR` with one exception, and it is unsafe: the
// template adds `\AECPilot` to the chosen folder only when the path does not already
// contain "AECPilot", and a silent `/D=` is not checked at all. A person who installs
// into `D:\AECPilot` next to their projects, or an admin who passes `/D=D:\`, would lose
// every file there — while the removal page promises the opposite.
//
// So the uninstaller removes exactly what the installer put there: the top level of the
// packed app folder, read after packing (`afterPack` in electron-builder.config.cjs) and
// written as an NSIS macro that build/installer.nsh includes. A file that is not ours
// stays, whatever folder the program was installed into.
// @ts-check
'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** Names the uninstaller handles itself (or never touches): a packed entry with one of
 *  these names would be removed twice or, for `data`, with the person's data. */
const RESERVED = new Set(['data', 'install-mode.txt'])

/** `"$INSTDIR\<name>"` as an NSIS string: `$` in the name would start a variable. */
function inInstdir(name) {
  // Non-ASCII would be misread from this BOM-less file and the entry silently left behind.
  if (/["\\/]|[^\x20-\x7e]/.test(name) || name === '' || name === '.' || name === '..') {
    throw new Error(`installed-entries: unusable name ${JSON.stringify(name)}`)
  }
  return `"$INSTDIR\\${name.replace(/\$/g, '$$$$')}"`
}

/**
 * The macro body for the given top-level entries of the app folder.
 * @param {{ name: string, dir: boolean }[]} entries
 * @param {string} uninstallerName the template's `Uninstall <product>.exe`
 */
function renderInstalledEntries(entries, uninstallerName) {
  if (entries.length === 0) throw new Error('installed-entries: the app folder is empty')
  const lines = [
    // ASCII only: NSIS reads an included file without a BOM in the system code page.
    '; GENERATED at packing time by installed-entries.cjs - do not edit (task T30.1).',
    '!macro aecRemoveInstalledEntries'
  ]
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of sorted) {
    if (RESERVED.has(entry.name.toLowerCase())) {
      throw new Error(`installed-entries: the app folder must not contain "${entry.name}"`)
    }
    const target = inInstdir(entry.name)
    lines.push(entry.dir ? `  RMDir /r ${target}` : `  Delete ${target}`)
  }
  lines.push(`  Delete ${inInstdir(uninstallerName)}`)
  lines.push('!macroend', '')
  return lines.join('\r\n')
}

/** Top-level entries of the packed app folder. */
function readInstalledEntries(appOutDir) {
  return fs
    .readdirSync(appOutDir, { withFileTypes: true })
    .map((entry) => ({ name: entry.name, dir: entry.isDirectory() }))
}

/** `afterPack`: write the macro next to installer.nsh before NSIS compiles. */
function writeInstalledEntries(appOutDir, buildResourcesDir, productFilename) {
  const text = renderInstalledEntries(
    readInstalledEntries(appOutDir),
    `Uninstall ${productFilename}.exe`
  )
  fs.writeFileSync(path.join(buildResourcesDir, 'installed-entries.nsh'), text, 'utf-8')
}

module.exports = { renderInstalledEntries, readInstalledEntries, writeInstalledEntries }
