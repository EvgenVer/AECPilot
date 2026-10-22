// Task T30.1: the uninstaller removes exactly the packed top level — the list the
// build writes for build/installer.nsh (installed-entries.cjs).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

interface Entry {
  name: string
  dir: boolean
}
const { renderInstalledEntries, writeInstalledEntries } = createRequire(import.meta.url)(
  '../../installed-entries.cjs'
) as {
  renderInstalledEntries: (entries: Entry[], uninstaller: string) => string
  writeInstalledEntries: (appOutDir: string, resources: string, product: string) => void
}

const UNINSTALLER = 'Uninstall AECPilot.exe'

describe('renderInstalledEntries', () => {
  it('removes folders recursively and files one by one, then the uninstaller', () => {
    const text = renderInstalledEntries(
      [
        { name: 'runtime', dir: true },
        { name: 'AECPilot.exe', dir: false }
      ],
      UNINSTALLER
    )
    const body = text.split('\r\n')
    expect(body).toContain('!macro aecRemoveInstalledEntries')
    expect(body).toContain('  RMDir /r "$INSTDIR\\runtime"')
    expect(body).toContain('  Delete "$INSTDIR\\AECPilot.exe"')
    expect(body).toContain('  Delete "$INSTDIR\\Uninstall AECPilot.exe"')
    expect(body).toContain('!macroend')
  })

  it('never names the person’s data or anything outside the listed entries', () => {
    const text = renderInstalledEntries([{ name: 'locales', dir: true }], UNINSTALLER)
    expect(text).not.toMatch(/\$INSTDIR\\data/)
    expect(text).not.toMatch(/\$INSTDIR\\\*|RMDir \/r "\$INSTDIR"/)
  })

  it('refuses a packed entry named like the person’s data or the mode file', () => {
    expect(() => renderInstalledEntries([{ name: 'data', dir: true }], UNINSTALLER)).toThrow()
    expect(() => renderInstalledEntries([{ name: 'Data', dir: true }], UNINSTALLER)).toThrow()
    expect(() =>
      renderInstalledEntries([{ name: 'install-mode.txt', dir: false }], UNINSTALLER)
    ).toThrow()
  })

  it('refuses an empty folder and names that would leave $INSTDIR', () => {
    expect(() => renderInstalledEntries([], UNINSTALLER)).toThrow()
    for (const name of ['..', '.', 'a\\b', 'a/b', 'a"b', '', 'файл.dll', 'a\nb']) {
      expect(() => renderInstalledEntries([{ name, dir: false }], UNINSTALLER)).toThrow()
    }
  })

  it('escapes $ in a name so NSIS does not read a variable', () => {
    const text = renderInstalledEntries([{ name: 'a$b.dll', dir: false }], UNINSTALLER)
    expect(text).toContain('Delete "$INSTDIR\\a$$b.dll"')
  })
})

describe('writeInstalledEntries', () => {
  const made: string[] = []
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('lists the top level of the packed folder, not its contents', () => {
    const app = mkdtempSync(join(tmpdir(), 'aec-entries-app-'))
    const res = mkdtempSync(join(tmpdir(), 'aec-entries-res-'))
    made.push(app, res)
    mkdirSync(join(app, 'runtime', 'core'), { recursive: true })
    writeFileSync(join(app, 'runtime', 'core', 'deep.txt'), '')
    writeFileSync(join(app, 'AECPilot.exe'), '')
    writeInstalledEntries(app, res, 'AECPilot')
    const text = readFileSync(join(res, 'installed-entries.nsh'), 'utf-8')
    expect(text).toContain('RMDir /r "$INSTDIR\\runtime"')
    expect(text).toContain('Delete "$INSTDIR\\AECPilot.exe"')
    expect(text).toContain('Delete "$INSTDIR\\Uninstall AECPilot.exe"')
    expect(text).not.toContain('deep.txt')
  })
})
