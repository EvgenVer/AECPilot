// Task T43.2 (SPEC A8): THIRD-PARTY-NOTICES.txt of the installed tree, built from a
// small fake of the packed folder (third-party-notices.cjs).
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

interface Owner {
  holder?: string
  contact?: string
}
const { renderThirdPartyNotices, gitForWindowsTag } = createRequire(import.meta.url)(
  '../../third-party-notices.cjs'
) as {
  renderThirdPartyNotices: (args: { appOutDir: string; desktopDir: string; owner: Owner }) => string
  gitForWindowsTag: (folder: string) => string | null
}

const OWNER = { holder: 'Тест Владелец', contact: 'owner@example.org' }

let root: string
let desktop: string
let app: string

function put(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf-8')
}

function dist(
  sitePackages: string,
  name: string,
  headers: string,
  files: Record<string, string> = {}
): void {
  const info = join(sitePackages, `${name.replaceAll('-', '_')}-1.0.dist-info`)
  put(
    join(info, 'METADATA'),
    `Metadata-Version: 2.4\nName: ${name}\nVersion: 1.0\n${headers}\n\nbody\n`
  )
  for (const [file, text] of Object.entries(files)) put(join(info, file), text)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aecpilot-notices-'))
  desktop = join(root, 'desktop')
  app = join(root, 'app')
  put(join(desktop, 'package.json'), JSON.stringify({ dependencies: { alpha: '1' } }))
  put(
    join(desktop, 'node_modules', 'alpha', 'package.json'),
    JSON.stringify({ name: 'alpha', version: '1.0.0', license: 'MIT', dependencies: { beta: '2' } })
  )
  put(join(desktop, 'node_modules', 'alpha', 'LICENSE'), 'ALPHA LICENSE TEXT')
  put(
    join(desktop, 'node_modules', 'beta', 'package.json'),
    JSON.stringify({ name: 'beta', version: '2.0.0', license: 'ISC', author: 'Beta Author' })
  )
  put(join(desktop, 'src', 'renderer', 'src', 'donor', 'LICENSE.donor'), 'DONOR MIT TEXT')
  const tools = join(app, 'runtime', 'core', 'tools')
  put(join(tools, 'git-2.53.0+3-win32-x64', 'LICENSE.txt'), 'GPLv2')
  mkdirSync(join(tools, 'uv-0.12.3-win32-x64'), { recursive: true })
  const sp = join(app, 'runtime', 'mcp', 'python', 'Lib', 'site-packages')
  dist(sp, 'withtext', 'License-Expression: BSD-3-Clause', { 'licenses/LICENSE': 'x' })
  dist(sp, 'notext', 'License-Expression: MIT\nAuthor: Some Author')
  dist(sp, 'aec-rag', '')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('renderThirdPartyNotices', () => {
  it('makes the written offer for Git for Windows with the holder, contact and source tag', () => {
    const text = renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: OWNER })
    expect(text).toContain('https://github.com/git-for-windows/git/releases/tag/v2.53.0.windows.3')
    expect(text).toContain('Тест Владелец по запросу на owner@example.org')
    expect(text).toContain('runtime/core/tools/git-2.53.0+3-win32-x64/LICENSE.txt')
  })

  describe('speech recognition', () => {
    const site = (): string => join(app, 'runtime', 'core', 'venv', 'Lib', 'site-packages')
    const render = (): string =>
      renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: OWNER })

    beforeEach(() => {
      // The real license texts, next to the script.
      cpSync(
        join(__dirname, '..', '..', 'third-party-licenses'),
        join(desktop, 'third-party-licenses'),
        { recursive: true }
      )
    })

    function putAv(): void {
      const info = join(site(), 'av-18.1.1.dist-info')
      const metadata =
        'Metadata-Version: 2.4\nName: av\nVersion: 18.1.1\nLicense-Expression: BSD-3-Clause\n\nx\n'
      put(join(info, 'METADATA'), metadata)
      put(join(info, 'licenses', 'LICENSE.txt'), 'PYAV')
      put(join(site(), 'av.libs', 'libx264-165-aa.dll'), '')
      put(join(site(), 'av.libs', 'libstdc++-6-aa.dll'), '')
    }

    it('gives nothing about PyAV and Intel OpenMP when they are not shipped', () => {
      expect(render()).not.toMatch(/x264|Intel OpenMP/)
    })

    it('gives the PyAV libraries with their sources, license texts and the written offer', () => {
      putAv()
      const text = render()
      expect(text).toContain('https://github.com/PyAV-Org/PyAV/tree/v18.1.1')
      expect(text).toContain('https://github.com/PyAV-Org/pyav-ffmpeg/tree/8.1.3-1')
      expect(text).toContain('/x264/-/archive/b35605ace3ddf7c1a5d67a2eb553f034aef41d55/')
      expect(text).toMatch(/x265 4\.3[\s\S]*Тест Владелец по запросу на owner@example\.org/)
      expect(text).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 2, June 1991/)
      expect(text).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/)
      expect(text).toMatch(/GNU LESSER GENERAL PUBLIC LICENSE\s+Version 2\.1, February 1999/)
      expect(text).toMatch(/GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/)
      expect(text).toContain('GCC RUNTIME LIBRARY EXCEPTION')
    })

    it('stops the build on a library of the PyAV wheel it holds no license for', () => {
      putAv()
      put(join(site(), 'av.libs', 'libnew-1-aa.dll'), '')
      expect(render).toThrow(/libnew-1-aa\.dll/)
    })

    it('gives the Intel license when its OpenMP runtime is shipped', () => {
      put(join(site(), 'ctranslate2', 'libiomp5md.dll'), '')
      expect(render()).toContain('Intel End User License Agreement for Developer Tools')
    })
  })

  it('stops when the shipped PyAV is not the one the source links were checked for', () => {
    const info = join(app, 'runtime', 'core', 'venv', 'Lib', 'site-packages', 'av-19.0.0.dist-info')
    put(join(info, 'METADATA'), 'Metadata-Version: 2.4\nName: av\nVersion: 19.0.0\n\nx\n')
    expect(() =>
      renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: OWNER })
    ).toThrow(/PyAV 19\.0\.0/)
  })

  it('gives npm licenses in full, and a standard text with the holder when a package has none', () => {
    const text = renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: OWNER })
    expect(text).toContain('alpha 1.0.0 — MIT')
    expect(text).toContain('ALPHA LICENSE TEXT')
    expect(text).toContain('beta 2.0.0 — ISC')
    expect(text).toContain('Copyright (c) Beta Author. ISC')
    expect(text).toContain('ISC License')
    expect(text).toContain('DONOR MIT TEXT')
  })

  it('lists Python packages with the path of their text, a standard text otherwise, and not ours', () => {
    const text = renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: OWNER })
    expect(text).toContain('withtext 1.0 — BSD-3-Clause')
    expect(text).toContain(
      'runtime/mcp/python/Lib/site-packages/withtext-1.0.dist-info/licenses/LICENSE'
    )
    expect(text).toContain('Copyright (c) Some Author. MIT')
    expect(text).toContain('MIT License')
    expect(text).not.toMatch(/^aec-rag/m)
    // uv ships no text: its MIT text is given.
    expect(text).toContain('uv — MIT OR Apache-2.0, Copyright (c) Astral Software Inc.')
  })

  it('stops the build without a holder or a contact', () => {
    expect(() =>
      renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: { holder: 'X' } })
    ).toThrow(/sourceOfferContact/)
  })

  it('stops the build on a package without a text whose license it holds no text for', () => {
    dist(
      join(app, 'runtime', 'mcp', 'python', 'Lib', 'site-packages'),
      'copyleft',
      'License-Expression: GPL-3.0-only'
    )
    expect(() =>
      renderThirdPartyNotices({ appOutDir: app, desktopDir: desktop, owner: OWNER })
    ).toThrow(/copyleft/)
  })
})

describe('gitForWindowsTag', () => {
  it('maps the tool folder to the Git for Windows release tag', () => {
    expect(gitForWindowsTag('git-2.53.0+3-win32-x64')).toBe('v2.53.0.windows.3')
    expect(gitForWindowsTag('node-26.7.0-win32-x64')).toBeNull()
  })
})
