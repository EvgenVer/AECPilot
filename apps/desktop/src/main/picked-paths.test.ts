import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  forgetPickedPaths,
  rememberPickedPath,
  wasPickedByUser,
  wasPickedOrIsKnown
} from './picked-paths'

afterEach(() => {
  forgetPickedPaths()
})

const ROOT = path.resolve('C:/проекты/объект-x')

describe('picked-paths (task 4D-11)', () => {
  it('does not vouch for a path nobody picked', () => {
    expect(wasPickedByUser(ROOT)).toBe(false)
  })

  it('vouches for a path a dialog handed out', () => {
    rememberPickedPath(ROOT)

    expect(wasPickedByUser(ROOT)).toBe(true)
  })

  it('does not vouch for a sibling, a parent or a child of a picked path', () => {
    rememberPickedPath(ROOT)

    // The guard is "this exact folder was chosen", not "somewhere near one
    // was": a renderer that knows one real path must not get a whole subtree.
    expect(wasPickedByUser(path.join(ROOT, 'вложенная'))).toBe(false)
    expect(wasPickedByUser(path.dirname(ROOT))).toBe(false)
    expect(wasPickedByUser(path.resolve('C:/проекты/объект-y'))).toBe(false)
  })

  it('sees through a path spelled the long way', () => {
    rememberPickedPath(ROOT)

    // Same folder, written with a redundant `.` and a `..` hop — the renderer
    // round-trips the string, and an equal path must not read as a different one.
    expect(wasPickedByUser(path.join(ROOT, 'вложенная', '..'))).toBe(true)
    expect(wasPickedByUser(path.join(ROOT, '.'))).toBe(true)
  })

  it.runIf(process.platform === 'win32')('ignores case on Windows', () => {
    rememberPickedPath('C:\\Проекты\\Объект-X')

    expect(wasPickedByUser('c:\\проекты\\объект-x')).toBe(true)
  })

  it('forgets the oldest picks rather than growing without bound', () => {
    // A renderer that can reopen the dialog must not be able to turn the list
    // into a leak. Seventeen picks against a cap of sixteen: the first is gone,
    // the last sixteen stand.
    for (let i = 0; i < 17; i++) rememberPickedPath(path.resolve(`C:/п/${i}`))

    expect(wasPickedByUser(path.resolve('C:/п/0'))).toBe(false)
    expect(wasPickedByUser(path.resolve('C:/п/1'))).toBe(true)
    expect(wasPickedByUser(path.resolve('C:/п/16'))).toBe(true)
  })

  it('keeps a re-picked path alive instead of ageing it out', () => {
    rememberPickedPath(ROOT)
    for (let i = 0; i < 15; i++) rememberPickedPath(path.resolve(`C:/п/${i}`))
    rememberPickedPath(ROOT) // picked again — now the freshest
    for (let i = 15; i < 30; i++) rememberPickedPath(path.resolve(`C:/п/${i}`))

    expect(wasPickedByUser(ROOT)).toBe(true)
  })
})

// Находка D-47: `project:open` берёт послабленный вариант, потому что открытие
// из списка недавних — законный путь без диалога. Список ведёт сам главный
// процесс, поэтому ему можно верить; окну — по-прежнему нельзя.
describe('wasPickedOrIsKnown (находка D-47)', () => {
  it('пропускает выбранное в диалоге, даже если списка нет', () => {
    rememberPickedPath(ROOT)

    expect(wasPickedOrIsKnown(ROOT, [])).toBe(true)
  })

  it('пропускает то, что лежит в списке главного процесса', () => {
    expect(wasPickedOrIsKnown(ROOT, [ROOT])).toBe(true)
  })

  it('не пропускает путь, которого нет ни там, ни там', () => {
    rememberPickedPath(path.resolve('C:/проекты/другой'))

    expect(wasPickedOrIsKnown(ROOT, [path.resolve('C:/проекты/третий')])).toBe(false)
  })

  it('сверяет список так же, как выбор: длинное написание считается тем же путём', () => {
    expect(wasPickedOrIsKnown(path.join(ROOT, 'вложенная', '..'), [ROOT])).toBe(true)
  })

  it('не раздаёт поддерево: соседа и вложенную папку известного пути не пропускает', () => {
    expect(wasPickedOrIsKnown(path.join(ROOT, 'вложенная'), [ROOT])).toBe(false)
    expect(wasPickedOrIsKnown(path.dirname(ROOT), [ROOT])).toBe(false)
  })
})
