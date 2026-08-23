// Tests for making the "ask a specialist" tool reachable (task 3C.7).
//
// Two things are pinned here, and both are the reason this file exists rather
// than the merge helper being trusted twice:
//
//   1. registration reaches EVERY profile — a specialist created without
//      cloning starts with a config.yaml that has none of our servers, and a
//      tool missing from that profile means `@name` silently does nothing in
//      that specialist's chat;
//   2. the roster snapshot carries the two fields the tool needs and nothing
//      else. A file that carries more than its reader needs is a file that
//      leaks.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { profileConfigPaths, writeRosterSnapshot } from './register-aec-roster.mjs'

const made = []

function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aec-roster-test-'))
  made.push(dir)
  return dir
}

afterEach(() => {
  while (made.length) fs.rmSync(made.pop(), { recursive: true, force: true })
})

describe('profileConfigPaths', () => {
  it('is the default profile alone when there are no named profiles', () => {
    const dir = home()

    expect(profileConfigPaths(dir)).toEqual([path.join(dir, 'config.yaml')])
  })

  it("reaches every named profile — a specialist's own chat needs its own copy", () => {
    const dir = home()
    fs.mkdirSync(path.join(dir, 'profiles', 'smeta'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'profiles', 'elektrika'), { recursive: true })

    const found = profileConfigPaths(dir)

    expect(found).toContain(path.join(dir, 'profiles', 'smeta', 'config.yaml'))
    expect(found).toContain(path.join(dir, 'profiles', 'elektrika', 'config.yaml'))
  })

  it('names a profile that has no config.yaml yet — a fresh specialist has none', () => {
    const dir = home()
    fs.mkdirSync(path.join(dir, 'profiles', 'novyi'), { recursive: true })

    expect(profileConfigPaths(dir)).toContain(path.join(dir, 'profiles', 'novyi', 'config.yaml'))
  })

  it('ignores a stray file among the profile directories', () => {
    const dir = home()
    fs.mkdirSync(path.join(dir, 'profiles'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'profiles', 'readme.txt'), 'не профиль')

    expect(profileConfigPaths(dir)).toEqual([path.join(dir, 'config.yaml')])
  })
})

describe('writeRosterSnapshot', () => {
  it('carries the profile name and the name a person calls them by', () => {
    const file = path.join(home(), 'roster.json')

    expect(writeRosterSnapshot([{ name: 'smeta', title: 'Смета' }], file)).toBe(true)
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({
      specialists: [{ name: 'smeta', title: 'Смета' }]
    })
  })

  it('carries nothing else — looks, sessions and previews stay out of the file', () => {
    const file = path.join(home(), 'roster.json')
    writeRosterSnapshot(
      [{ name: 'smeta', title: 'Смета', chatSessionId: 'с-1', preview: 'чем занят' }],
      file
    )

    const raw = fs.readFileSync(file, 'utf-8')
    expect(raw).not.toContain('chatSessionId')
    expect(raw).not.toContain('preview')
  })

  it('an unnamed specialist keeps an empty title, not a missing key', () => {
    const file = path.join(home(), 'roster.json')
    writeRosterSnapshot([{ name: 'smeta' }], file)

    expect(JSON.parse(fs.readFileSync(file, 'utf-8')).specialists[0].title).toBe('')
  })

  it('says nothing changed when nothing changed — the roster is re-read often', () => {
    const file = path.join(home(), 'roster.json')
    const roster = [{ name: 'smeta', title: 'Смета' }]

    expect(writeRosterSnapshot(roster, file)).toBe(true)
    expect(writeRosterSnapshot(roster, file)).toBe(false)
    expect(writeRosterSnapshot([{ name: 'smeta', title: 'Сметчик' }], file)).toBe(true)
  })
})
