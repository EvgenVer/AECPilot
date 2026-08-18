import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { forgetPickedDirectories, rememberPickedDirectory, wasPickedByUser } from './picked-paths'

afterEach(() => {
  forgetPickedDirectories()
})

const ROOT = path.resolve('C:/проекты/объект-x')

describe('picked-paths (task 4D-11)', () => {
  it('does not vouch for a path nobody picked', () => {
    expect(wasPickedByUser(ROOT)).toBe(false)
  })

  it('vouches for a path a dialog handed out', () => {
    rememberPickedDirectory(ROOT)

    expect(wasPickedByUser(ROOT)).toBe(true)
  })

  it('does not vouch for a sibling, a parent or a child of a picked path', () => {
    rememberPickedDirectory(ROOT)

    // The guard is "this exact folder was chosen", not "somewhere near one
    // was": a renderer that knows one real path must not get a whole subtree.
    expect(wasPickedByUser(path.join(ROOT, 'вложенная'))).toBe(false)
    expect(wasPickedByUser(path.dirname(ROOT))).toBe(false)
    expect(wasPickedByUser(path.resolve('C:/проекты/объект-y'))).toBe(false)
  })

  it('sees through a path spelled the long way', () => {
    rememberPickedDirectory(ROOT)

    // Same folder, written with a redundant `.` and a `..` hop — the renderer
    // round-trips the string, and an equal path must not read as a different one.
    expect(wasPickedByUser(path.join(ROOT, 'вложенная', '..'))).toBe(true)
    expect(wasPickedByUser(path.join(ROOT, '.'))).toBe(true)
  })

  it.runIf(process.platform === 'win32')('ignores case on Windows', () => {
    rememberPickedDirectory('C:\\Проекты\\Объект-X')

    expect(wasPickedByUser('c:\\проекты\\объект-x')).toBe(true)
  })

  it('forgets the oldest picks rather than growing without bound', () => {
    // A renderer that can reopen the dialog must not be able to turn the list
    // into a leak. Seventeen picks against a cap of sixteen: the first is gone,
    // the last sixteen stand.
    for (let i = 0; i < 17; i++) rememberPickedDirectory(path.resolve(`C:/п/${i}`))

    expect(wasPickedByUser(path.resolve('C:/п/0'))).toBe(false)
    expect(wasPickedByUser(path.resolve('C:/п/1'))).toBe(true)
    expect(wasPickedByUser(path.resolve('C:/п/16'))).toBe(true)
  })

  it('keeps a re-picked path alive instead of ageing it out', () => {
    rememberPickedDirectory(ROOT)
    for (let i = 0; i < 15; i++) rememberPickedDirectory(path.resolve(`C:/п/${i}`))
    rememberPickedDirectory(ROOT) // picked again — now the freshest
    for (let i = 15; i < 30; i++) rememberPickedDirectory(path.resolve(`C:/п/${i}`))

    expect(wasPickedByUser(ROOT)).toBe(true)
  })
})
