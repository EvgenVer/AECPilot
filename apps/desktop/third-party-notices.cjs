// THIRD-PARTY-NOTICES.txt of the installed tree (task T43.2, SPEC A8, owner decision
// 2026-10-22): the licenses of everything AECPilot ships that it did not write.
//
// Three kinds of components, three treatments:
// - npm packages of the interface and the main process: the vite bundle drops their
//   license files and comments, so their full texts go into this file — every package
//   of the production dependency closure of apps/desktop (a superset of what the
//   bundle holds), plus the donor's MIT license (Hermes Desktop);
// - Python packages of both runtimes, the core's tools, the core itself: their license
//   files ship in place inside the tree, so the file lists each with its version,
//   license and the path of that text; a component that ships no text gets it here;
// - Git for Windows (GPLv2, SPEC C3/N8): a link to the sources of the same version
//   and a written offer to send them on request for three years.
// Electron and Chromium bring their own `LICENSE.electron.txt`, `LICENSES.chromium.html`.
// @ts-check
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const NOTICES_NAME = 'THIRD-PARTY-NOTICES.txt'
const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i
const RULE = '='.repeat(78)

/** The folder of package `name` as Node finds it from `from` (same lookup as
 *  electron-builder.config.cjs). `null` — an optional dependency this platform skipped. */
function findPackageDir(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', ...name.split('/'))
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate)
    if (path.dirname(dir) === dir) return null
  }
}

function licenseFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort()
}

/** A package that ships no license file still owes its notice: the standard text of its
 *  license goes into the «standard texts» section once, and the package's entry names its
 *  copyright holder. Apache-2.0 is long and identical everywhere, so its text is taken from
 *  a copy that already ships in the tree. */
const MIT_TEXT = [
  'Permission is hereby granted, free of charge, to any person obtaining a copy of this',
  'software and associated documentation files (the "Software"), to deal in the Software',
  'without restriction, including without limitation the rights to use, copy, modify, merge,',
  'publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons',
  'to whom the Software is furnished to do so, subject to the following conditions:',
  '',
  'The above copyright notice and this permission notice shall be included in all copies or',
  'substantial portions of the Software.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,',
  'INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR',
  'PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE',
  'FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR',
  'OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER',
  'DEALINGS IN THE SOFTWARE.'
].join('\n')

const ISC_TEXT = [
  'Permission to use, copy, modify, and/or distribute this software for any purpose with or',
  'without fee is hereby granted, provided that the above copyright notice and this permission',
  'notice appear in all copies.',
  '',
  'THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS',
  'SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL',
  'THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY',
  'DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF',
  'CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE',
  'OR PERFORMANCE OF THIS SOFTWARE.'
].join('\n')

const BSD3_TEXT = [
  'Redistribution and use in source and binary forms, with or without modification, are',
  'permitted provided that the following conditions are met:',
  '',
  '1. Redistributions of source code must retain the above copyright notice, this list of',
  '   conditions and the following disclaimer.',
  '2. Redistributions in binary form must reproduce the above copyright notice, this list of',
  '   conditions and the following disclaimer in the documentation and/or other materials',
  '   provided with the distribution.',
  '3. Neither the name of the copyright holder nor the names of its contributors may be used',
  '   to endorse or promote products derived from this software without specific prior',
  '   written permission.',
  '',
  'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS',
  'OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF',
  'MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE',
  'COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,',
  'EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF',
  'SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)',
  'HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR',
  'TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS',
  'SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.'
].join('\n')

/** Python packages whose declared license is not one SPDX id, settled by hand:
 *  ANTLR's runtimes are BSD-3-Clause; pypdfium2 is Apache-2.0 OR BSD-3-Clause and bundles
 *  PDFium, a part of the Chromium project. */
const PYTHON_LICENSE_OVERRIDES = {
  'antlr4-python3-runtime': { license: 'BSD-3-Clause' },
  pypdfium2: {
    license: 'Apache-2.0',
    note: 'Встроенная библиотека PDFium / the bundled PDFium library — BSD-3-Clause, The PDFium Authors (часть Chromium; её компоненты — LICENSES.chromium.html).'
  }
}

/** `MIT`, `ISC`, `Apache-2.0`, `BSD-3-Clause`, `PSF` — or null for a license we hold no
 *  standard text of. */
function standardId(license) {
  const id = String(license).replace(/ License$/i, '').trim()
  if (/^MIT$/i.test(id)) return 'MIT'
  if (/^ISC$/i.test(id)) return 'ISC'
  if (/^BSD(-3-Clause)?$/i.test(id)) return 'BSD-3-Clause'
  // `Apache-2.0`, `Apache 2.0`, the classifier's `Apache Software` (its only version is 2.0).
  if (/^Apache( Software)?([- ]2(\.0)?)?$/i.test(id)) return 'Apache-2.0'
  // The PSF license text ships with both interpreters (their LICENSE.txt).
  if (/^(PSF(-2\.0)?|Python Software Foundation)$/i.test(id)) return 'PSF'
  return null
}

function authorOf(pkg) {
  if (typeof pkg.author === 'string') return pkg.author
  if (pkg.author?.name) return pkg.author.name
  return null
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ')
  return 'не указана / not stated'
}

/** Every package of the production closure of `desktopDir`'s package.json, one entry per
 *  name@version, sorted. */
function npmClosure(desktopDir) {
  const root = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf-8'))
  const seen = new Map()
  const visit = (name, from) => {
    const dir = findPackageDir(name, from)
    if (!dir) return
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
    const key = `${pkg.name ?? name}@${pkg.version}`
    if (seen.has(key)) return
    seen.set(key, { name: pkg.name ?? name, version: pkg.version, license: licenseOf(pkg), author: authorOf(pkg), dir })
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) visit(dep, dir)
  }
  for (const dep of Object.keys({ ...root.dependencies, ...root.optionalDependencies })) visit(dep, desktopDir)
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
}

/** METADATA headers of a dist-info: the first value of each name (multi-line folded). */
function metadata(distInfo) {
  const text = fs.readFileSync(path.join(distInfo, 'METADATA'), 'utf-8')
  const headers = text.split(/\r?\n\r?\n/, 1)[0]
  const fields = new Map()
  let last = null
  for (const line of headers.split(/\r?\n/)) {
    if (/^\s/.test(line) && last) {
      fields.get(last).push(line.trim())
      continue
    }
    const at = line.indexOf(':')
    if (at < 0) continue
    last = line.slice(0, at)
    if (!fields.has(last)) fields.set(last, [line.slice(at + 1).trim()])
    else if (last === 'Classifier') fields.get(last).push(line.slice(at + 1).trim())
  }
  return fields
}

function pythonLicense(fields) {
  const expression = fields.get('License-Expression')?.[0]
  if (expression) return expression
  const classifiers = (fields.get('Classifier') ?? [])
    .filter((c) => c.startsWith('License ::'))
    .map((c) => c.split(' :: ').pop())
  if (classifiers.length) return classifiers.join(', ')
  const declared = fields.get('License')?.[0]
  if (declared && declared.length <= 80) return declared
  return declared ? 'см. текст / see text' : 'не указана / not stated'
}

/** One row per distribution of `sitePackages`, with the paths (relative to `root`) of the
 *  license texts it ships. */
function pythonPackages(sitePackages, root) {
  const rows = []
  for (const entry of fs.readdirSync(sitePackages, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.dist-info')) continue
    const distInfo = path.join(sitePackages, entry.name)
    if (!fs.existsSync(path.join(distInfo, 'METADATA'))) continue
    const fields = metadata(distInfo)
    // AECPilot's own MCP servers are not third-party.
    if (/^aec-/i.test(fields.get('Name')?.[0] ?? '')) continue
    const texts = []
    const walk = (dir) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name)
        if (item.isDirectory()) walk(full)
        else if (LICENSE_FILE.test(item.name) || path.basename(dir) === 'licenses') texts.push(full)
      }
    }
    walk(distInfo)
    // Some packages keep the text in their own package folder (onnxruntime/LICENSE,
    // win32/license.txt of pywin32) rather than in the dist-info.
    if (!texts.length) {
      const record = path.join(distInfo, 'RECORD')
      const tops = fs.existsSync(record)
        ? new Set(
            fs
              .readFileSync(record, 'utf-8')
              .split(/\r?\n/)
              .map((line) => line.split(',')[0].split('/')[0])
              .filter((top) => top && !top.endsWith('.dist-info') && top !== '..' && !top.includes('.'))
          )
        : new Set()
      for (const top of tops) {
        const dir = path.join(sitePackages, top)
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          if (item.isFile() && (LICENSE_FILE.test(item.name) || /^thirdpartynotices/i.test(item.name))) {
            texts.push(path.join(dir, item.name))
          }
        }
      }
    }
    const name = fields.get('Name')?.[0] ?? entry.name
    const override = PYTHON_LICENSE_OVERRIDES[name.toLowerCase()]
    rows.push({
      name,
      version: fields.get('Version')?.[0] ?? '',
      license: override?.license ?? pythonLicense(fields),
      note: override?.note ?? null,
      author: fields.get('Author')?.[0] || fields.get('Author-email')?.[0] || fields.get('Maintainer')?.[0] || null,
      texts: texts.map((t) => path.relative(root, t).split(path.sep).join('/')).sort(),
      // A long free-text License field is the license itself: some packages ship no file.
      inline: texts.length ? null : (fields.get('License') ?? []).join('\n') || null
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

function section(title) {
  return `\n${RULE}\n${title}\n${RULE}\n`
}

function rel(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

/** The core's tools: `<name>-<version>-<target>` folders under runtime/core/tools. */
function coreTools(appOutDir) {
  const tools = path.join(appOutDir, 'runtime', 'core', 'tools')
  if (!fs.existsSync(tools)) return []
  return fs
    .readdirSync(tools, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      // The shallowest level that holds license texts: npm keeps its own one level down
      // (`node_modules/npm/LICENSE`).
      let level = [path.join(tools, entry.name)]
      for (let depth = 0; depth < 3 && level.length; depth++) {
        const texts = level.flatMap(licenseFiles)
        if (texts.length) return { folder: entry.name, texts: texts.map((file) => rel(appOutDir, file)) }
        level = level.flatMap((dir) =>
          fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((child) => child.isDirectory())
            .map((child) => path.join(dir, child.name))
        )
      }
      return { folder: entry.name, texts: [] }
    })
    .sort((a, b) => a.folder.localeCompare(b.folder))
}

/** Licenses of tools that ship no text of their own (checked against the folders above). */
const TOOL_LICENSES = {
  uv: [
    'uv — MIT OR Apache-2.0, Copyright (c) Astral Software Inc. https://github.com/astral-sh/uv',
    'Текст MIT (выбран из двух предложенных) / MIT text (chosen of the two offered):',
    '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy of this',
    'software and associated documentation files (the "Software"), to deal in the Software',
    'without restriction, including without limitation the rights to use, copy, modify, merge,',
    'publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons',
    'to whom the Software is furnished to do so, subject to the following conditions:',
    '',
    'The above copyright notice and this permission notice shall be included in all copies or',
    'substantial portions of the Software.',
    '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,',
    'INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR',
    'PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE',
    'FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR',
    'OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER',
    'DEALINGS IN THE SOFTWARE.'
  ].join('\n'),
  chromium: [
    'Chromium (сборка Chrome for Testing для запасного браузера агента / the Chrome for Testing',
    'build of the agent\'s fallback browser) — BSD-3-Clause, Copyright The Chromium Authors.',
    'Тексты лицензий Chromium и его компонентов — LICENSES.chromium.html в папке программы /',
    'the licenses of Chromium and its components are in LICENSES.chromium.html in the program',
    'folder (the same project as Electron\'s Chromium).'
  ].join('\n')
}

/** `git-2.53.0+3-win32-x64` -> Git for Windows `v2.53.0.windows.3`. */
function gitForWindowsTag(folder) {
  const match = /^git-(\d+\.\d+\.\d+)\+(\d+)-/.exec(folder)
  return match ? `v${match[1]}.windows.${match[2]}` : null
}

/**
 * The whole file. `owner` — the copyright holder of AECPilot and the address that
 * answers the written offer (`aecpilot.copyrightHolder`, `aecpilot.sourceOfferContact`
 * of the app's package.json).
 */
function renderThirdPartyNotices({ appOutDir, desktopDir, owner }) {
  if (!owner?.holder || !owner?.contact) {
    throw new Error('third-party notices: aecpilot.copyrightHolder and aecpilot.sourceOfferContact must be set')
  }
  const out = []
  out.push(
    'AECPilot — лицензии сторонних компонентов / Third-party notices',
    '',
    `AECPilot © ${owner.holder}. Лицензия самой программы — LICENSE.txt в папке программы.`,
    'В AECPilot входят компоненты других авторов; ниже — их лицензии. Для компонентов, чьи',
    'тексты лицензий лежат в папке программы рядом с ними, указан путь к тексту.',
    '',
    'AECPilot includes components by other authors; their licenses follow. Where a component',
    'ships its license text inside the program folder, the path to that text is given.'
  )

  // Git for Windows first: it is the one component with a source obligation.
  const tools = coreTools(appOutDir)
  const git = tools.find((tool) => tool.folder.startsWith('git-'))
  if (git) {
    const tag = gitForWindowsTag(git.folder)
    out.push(
      section('Git for Windows — GNU General Public License v2'),
      `Папка / folder: runtime/core/tools/${git.folder}`,
      `Текст лицензии / license text: ${git.texts.join(', ') || '(см. https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)'}`,
      '',
      'Git for Windows поставляется без изменений как отдельная программа. Исходный код этой',
      `версии${tag ? ` (${tag})` : ''} опубликован проектом Git for Windows:`,
      tag ? `  https://github.com/git-for-windows/git/releases/tag/${tag}` : '  https://github.com/git-for-windows/git/releases',
      '  https://gitforwindows.org/',
      'Письменное предложение: в течение трёх лет с момента получения этой копии AECPilot',
      `${owner.holder} по запросу на ${owner.contact} предоставит полный исходный код`,
      'Git for Windows и входящих в него компонентов под GPL в той версии, что поставлена с',
      'программой, за плату не выше стоимости передачи.',
      '',
      'Git for Windows ships unmodified as a separate program. The source code of this version',
      'is published by the Git for Windows project at the links above. Written offer: for three',
      `years from receiving this copy of AECPilot, ${owner.holder} will, on request to`,
      `${owner.contact}, provide the complete corresponding source code of Git for Windows and its`,
      'GPL-licensed components in the version shipped, for a charge no more than the cost of',
      'physically performing the transfer.'
    )
  }

  const donor = path.join(desktopDir, 'src', 'renderer', 'src', 'donor')
  out.push(
    section('Hermes Desktop (интерфейс / the interface) — MIT'),
    fs.readFileSync(path.join(donor, 'LICENSE.donor'), 'utf-8').trim()
  )
  const bots = path.join(donor, 'plugins', 'hermes-bots', 'LICENSE')
  if (fs.existsSync(bots)) {
    out.push(section('Hermes Desktop — hermes-bots plugin'), fs.readFileSync(bots, 'utf-8').trim())
  }

  out.push(
    section('Иконки Codicons / Codicons icons — CC BY 4.0'),
    'Codicons © Microsoft Corporation, https://github.com/microsoft/vscode-codicons,',
    'licensed under Creative Commons Attribution 4.0 International',
    '(https://creativecommons.org/licenses/by/4.0/). Полный текст — в разделе пакета',
    '@vscode/codicons ниже / full text in the @vscode/codicons entry below.'
  )

  const packages = npmClosure(desktopDir)
  out.push(
    section(`Пакеты npm интерфейса и главного процесса / npm packages (${packages.length})`),
    'Сборка интерфейса удаляет тексты лицензий из кода, поэтому они приведены здесь полностью.',
    'The interface build strips license texts from the code, so they are given here in full.'
  )
  const standards = new Set()
  /** The line for a component without a text of its own; throws on a license we cannot
   *  supply a text for, so a new dependency of that kind stops the build, not the notice. */
  const standardLine = (name, license, author) => {
    const id = standardId(license)
    if (!id) throw new Error(`third-party notices: ${name} ships no license text and ${license} has no standard text here`)
    if (id === 'PSF') {
      return `Copyright (c) ${author || `the ${name} authors`}. PSF: текст — LICENSE.txt интерпретатора Python (раздел Python выше) / text in the Python interpreter's LICENSE.txt (Python section above).`
    }
    standards.add(id)
    return `Copyright (c) ${author || `the ${name} authors`}. ${id}: стандартный текст — в конце файла / standard text at the end of this file.`
  }
  for (const pkg of packages) {
    out.push('', '-'.repeat(78), `${pkg.name} ${pkg.version} — ${pkg.license}`, '-'.repeat(78))
    const texts = licenseFiles(pkg.dir)
    if (!texts.length) out.push(standardLine(pkg.name, pkg.license, pkg.author))
    for (const file of texts) out.push(fs.readFileSync(file, 'utf-8').trim())
  }

  out.push(
    section('Electron, Chromium'),
    'Electron — MIT: LICENSE.electron.txt. Chromium и его компоненты / Chromium and its',
    'components: LICENSES.chromium.html.'
  )

  out.push(section('Инструменты ядра / the core\'s tools (runtime/core/tools)'))
  for (const tool of tools) {
    const kind = Object.keys(TOOL_LICENSES).find((name) => tool.folder.startsWith(`${name}-`))
    if (tool.texts.length) out.push(`${tool.folder}: ${tool.texts.join(', ')}`)
    else if (kind) out.push('', `${tool.folder}:`, TOOL_LICENSES[kind], '')
    else throw new Error(`third-party notices: no license text for core tool ${tool.folder}`)
  }

  const core = path.join(appOutDir, 'runtime', 'core', 'hermes-agent', 'LICENSE')
  out.push(section('Ядро Hermes Agent / the Hermes Agent core'))
  out.push(fs.existsSync(core) ? `MIT: ${rel(appOutDir, core)}` : 'MIT, Copyright (c) 2025 Nous Research')
  const mem0 = path.join(appOutDir, 'runtime', '.mem0-plugin-src', 'integrations', 'hermes-plugin-mem0', 'LICENSE')
  if (fs.existsSync(mem0)) out.push(`Плагин памяти Mem0 / the Mem0 memory plugin — Apache-2.0: ${rel(appOutDir, mem0)}`)

  const runtimes = [
    ['Python ядра / the core\'s Python', path.join(appOutDir, 'runtime', 'core', 'venv', 'Lib', 'site-packages')],
    ['Python MCP-серверов / the MCP servers\' Python', path.join(appOutDir, 'runtime', 'mcp', 'python', 'Lib', 'site-packages')]
  ]
  const cpython = [
    path.join(appOutDir, 'runtime', 'mcp', 'python', 'LICENSE.txt'),
    ...tools.filter((t) => t.folder.startsWith('python-')).flatMap((t) => t.texts.map((x) => path.join(appOutDir, x)))
  ].filter((file) => fs.existsSync(file))
  out.push(
    section('Python (CPython) — Python Software Foundation License'),
    ...cpython.map((file) => rel(appOutDir, file))
  )
  let apacheText = null
  for (const [title, sitePackages] of runtimes) {
    if (!fs.existsSync(sitePackages)) continue
    const rows = pythonPackages(sitePackages, appOutDir)
    out.push(section(`${title}: пакеты / packages (${rows.length})`))
    for (const row of rows) {
      out.push(`${row.name} ${row.version} — ${row.license}`)
      for (const text of row.texts) {
        out.push(`    ${text}`)
        if (!apacheText) {
          const body = fs.readFileSync(path.join(appOutDir, text), 'utf-8')
          if (/^\s*Apache License\s+Version 2\.0, January 2004/.test(body)) apacheText = body.trim()
        }
      }
      // A long free-text License field is the license itself; a short one is only its name.
      if (row.inline && row.inline.length > 80) out.push(...row.inline.split('\n').map((line) => `    ${line}`))
      else if (!row.texts.length) out.push(`    ${standardLine(row.name, row.license, row.author)}`)
      if (row.note) out.push(`    ${row.note}`)
    }
  }

  if (standards.size) out.push(section('Стандартные тексты лицензий / standard license texts'))
  if (standards.has('MIT')) out.push('MIT License', '', MIT_TEXT, '')
  if (standards.has('ISC')) out.push('ISC License', '', ISC_TEXT, '')
  if (standards.has('BSD-3-Clause')) out.push('BSD 3-Clause License', '', BSD3_TEXT, '')
  if (standards.has('Apache-2.0')) {
    if (!apacheText) throw new Error('third-party notices: no shipped copy of the Apache-2.0 text found')
    out.push(apacheText, '')
  }
  return out.join('\n') + '\n'
}

function readOwner(desktopDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf-8'))
  return { holder: pkg.aecpilot?.copyrightHolder, contact: pkg.aecpilot?.sourceOfferContact }
}

/** electron-builder's afterPack: writes the file into the packed tree, before the
 *  uninstaller's list of installed entries is taken. */
function writeThirdPartyNotices(appOutDir, desktopDir) {
  const text = renderThirdPartyNotices({ appOutDir, desktopDir, owner: readOwner(desktopDir) })
  fs.writeFileSync(path.join(appOutDir, NOTICES_NAME), text, 'utf-8')
  return path.join(appOutDir, NOTICES_NAME)
}

module.exports = {
  NOTICES_NAME,
  gitForWindowsTag,
  npmClosure,
  pythonPackages,
  readOwner,
  renderThirdPartyNotices,
  writeThirdPartyNotices
}
