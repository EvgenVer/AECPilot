import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from 'vitest'
import { preparedJournal, renameWithRetry } from './prepared-submissions'

test('acknowledged journal mutations survive reopening with exact payload and origin isolation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepared-journal-'))

  try {
    const origin = 'http://localhost:5174'
    const key = JSON.stringify(['remote', 'profile-a', 'stored-a'])
    const entry = {
      id: 'id-a',
      text: 'Ω 👩🏽‍💻 e\u0301\n  []',
      attachments: [{ id: 'asset', path: '/tmp/Ω' }],
      params: { session_id: 'live-a' }
    }
    preparedJournal(dir, origin).update(key, entry)
    preparedJournal(dir, origin).update('other-profile', { id: 'id-b' })
    expect(preparedJournal(dir, origin).read()[key]).toEqual(entry)
    expect(preparedJournal(dir, 'http://other:5174').read()).toEqual({})
    preparedJournal(dir, origin).update(key, null)
    expect(preparedJournal(dir, origin).read()).toEqual({ 'other-profile': { id: 'id-b' } })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a corrupt journal is quarantined with its bytes kept, and the origin can send again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepared-journal-'))

  try {
    const origin = 'http://localhost:5174'
    preparedJournal(dir, origin).update('kept', { id: 'id-a' })
    const [file] = fs.readdirSync(dir).map((name) => path.join(dir, name))
    fs.writeFileSync(file, '{"kept":{"id":"id-')

    expect(preparedJournal(dir, origin).read()).toEqual({})
    preparedJournal(dir, origin).update('next', { id: 'id-b' })
    expect(preparedJournal(dir, origin).read()).toEqual({ next: { id: 'id-b' } })
    const aside = fs.readdirSync(dir).filter((name) => name.includes('.corrupt-'))
    expect(aside.map((name) => fs.readFileSync(path.join(dir, name), 'utf8'))).toEqual([
      '{"kept":{"id":"id-'
    ])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function locked(code: string): Error {
  return Object.assign(new Error(`${code}: operation not permitted, rename`), { code })
}

test('a rename an antivirus holds for a moment is retried, not lost (T52 review)', () => {
  const calls: string[] = []
  renameWithRetry('a.tmp', 'a.json', (from) => {
    calls.push(from)
    if (calls.length < 3) throw locked(calls.length === 1 ? 'EPERM' : 'EBUSY')
  })
  expect(calls).toHaveLength(3)
})

test('a rename that stays locked, or fails for another reason, still throws', () => {
  let tries = 0
  expect(() =>
    renameWithRetry('a.tmp', 'a.json', () => {
      tries += 1
      throw locked('EBUSY')
    })
  ).toThrow('EBUSY')
  expect(tries, 'four retries after the first try').toBe(5)

  tries = 0
  expect(() =>
    renameWithRetry('a.tmp', 'a.json', () => {
      tries += 1
      throw locked('ENOENT')
    })
  ).toThrow('ENOENT')
  expect(tries).toBe(1)
})
