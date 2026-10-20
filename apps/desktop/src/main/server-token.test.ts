// Задача T32/T35: постоянный токен сервера. Хранилище ОС подменено обратимой
// «шифровкой», чтобы проверить сами правила: токен переживает перезапуск, на диске
// не лежит открытым, без шифрования не пишется вовсе.

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { loadOrCreateServerToken, rotateServerToken, type ServerTokenDeps } from './server-token'

let dir: string

const reversing = (available = true): ServerTokenDeps['secure'] => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from([...plain].reverse().join(''), 'utf-8'),
  decryptString: (encrypted) => [...encrypted.toString('utf-8')].reverse().join('')
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aec-server-token-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('постоянный токен сервера', () => {
  it('создаётся один раз и переживает перезапуск', () => {
    const deps = { userDataDir: dir, secure: reversing() }
    const first = loadOrCreateServerToken(deps)
    expect(first).toMatch(/^[0-9a-f]{48}$/)
    expect(loadOrCreateServerToken(deps)).toBe(first)
  })

  it('на диске не лежит открытым текстом', () => {
    const token = loadOrCreateServerToken({ userDataDir: dir, secure: reversing() })
    expect(readFileSync(join(dir, 'server-token.json'), 'utf-8')).not.toContain(token)
  })

  it('«выдать новый» заменяет прежний', () => {
    const deps = { userDataDir: dir, secure: reversing() }
    const first = loadOrCreateServerToken(deps)
    const second = rotateServerToken(deps)
    expect(second).not.toBe(first)
    expect(loadOrCreateServerToken(deps)).toBe(second)
  })

  it('без шифрования ОС токен не пишется — живёт только в памяти', () => {
    const token = loadOrCreateServerToken({ userDataDir: dir, secure: reversing(false) })
    expect(token).toMatch(/^[0-9a-f]{48}$/)
    expect(existsSync(join(dir, 'server-token.json'))).toBe(false)
  })
})
