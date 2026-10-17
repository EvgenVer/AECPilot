// Задача T20.6 — провайдер Mem0 ставится в профиль копией с пина.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { MEM0_PLUGIN_DIR } from './hermes-env.mjs'
import {
  installMem0Plugin,
  MEM0_PLUGIN_FILES,
  MEM0_PROVIDER_ID,
  withoutPipDependencies
} from './register-mem0-plugin.mjs'

const temps = []
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-mem0-plugin-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  while (temps.length) fs.rmSync(temps.pop(), { recursive: true, force: true })
})

function fakeSource() {
  const dir = tempDir()
  for (const name of MEM0_PLUGIN_FILES) fs.writeFileSync(path.join(dir, name), `${name} v1\n`)
  fs.mkdirSync(path.join(dir, 'tests'))
  fs.writeFileSync(path.join(dir, 'tests', 'test_x.py'), 'import pytest\n')
  fs.writeFileSync(path.join(dir, 'README.md'), 'readme\n')
  return dir
}

describe('installMem0Plugin', () => {
  it('копирует файлы плагина в <home>/plugins/mem0 без тестов и README, повтор ничего не меняет', () => {
    const source = fakeSource()
    const home = tempDir()
    expect(installMem0Plugin(home, source)).toEqual({ changed: true, missing: false })
    const target = path.join(home, 'plugins', MEM0_PROVIDER_ID)
    expect(fs.readdirSync(target).sort()).toEqual([...MEM0_PLUGIN_FILES].sort())
    expect(installMem0Plugin(home, source)).toEqual({ changed: false, missing: false })

    fs.writeFileSync(path.join(source, '_backend.py'), '_backend.py v2\n')
    expect(installMem0Plugin(home, source).changed).toBe(true)
    expect(fs.readFileSync(path.join(target, '_backend.py'), 'utf-8')).toBe('_backend.py v2\n')
  })

  // T21.2: без объявленных зависимостей плагин не «участник» PM ядра.
  it('plugin.yaml едет без pip_dependencies, остальное слово в слово', () => {
    const source = fakeSource()
    fs.writeFileSync(
      path.join(source, 'plugin.yaml'),
      'name: mem0\nversion: 1.3.0\npip_dependencies:\n  - mem0ai>=2.0.10,<3\nhooks:\n  - on_session_end\n'
    )
    const home = tempDir()
    installMem0Plugin(home, source)
    const copied = fs.readFileSync(
      path.join(home, 'plugins', MEM0_PROVIDER_ID, 'plugin.yaml'),
      'utf-8'
    )
    expect(copied).toBe('name: mem0\nversion: 1.3.0\nhooks:\n  - on_session_end\n')
    expect(installMem0Plugin(home, source).changed).toBe(false)
    expect(withoutPipDependencies('a: 1\r\npython_dependencies:\r\n- x\r\nb: 2\r\n')).toBe(
      'a: 1\r\nb: 2\r\n'
    )
  })

  it('без исходника профиль не трогается', () => {
    const home = tempDir()
    expect(installMem0Plugin(home, path.join(home, 'nope'))).toEqual({
      changed: false,
      missing: true
    })
    expect(fs.existsSync(path.join(home, 'plugins'))).toBe(false)
  })

  it.skipIf(!fs.existsSync(MEM0_PLUGIN_DIR))(
    'на пине есть ровно эти файлы, и это провайдер памяти',
    () => {
      for (const name of MEM0_PLUGIN_FILES)
        expect(fs.existsSync(path.join(MEM0_PLUGIN_DIR, name)), name).toBe(true)
      const manifest = fs.readFileSync(path.join(MEM0_PLUGIN_DIR, 'plugin.yaml'), 'utf-8')
      expect(manifest).toMatch(/^name: mem0$/m)
      const init = fs.readFileSync(path.join(MEM0_PLUGIN_DIR, '__init__.py'), 'utf-8')
      expect(init).toMatch(/MemoryProvider/)
    }
  )
})
