import { describe, expect, it } from 'vitest'

import type { VaultTreeNode } from '../../../../shared/ipc'

import { indexMark } from './project-index-pure'

const wiki: VaultTreeNode = {
  children: [
    { name: 'КР.md', path: 'wiki/КР.md', type: 'file' },
    {
      children: [{ name: 'ОВ.md', path: 'wiki/разделы/ОВ.md', type: 'file' }],
      name: 'разделы',
      path: 'wiki/разделы',
      type: 'dir'
    }
  ],
  name: 'wiki',
  path: 'wiki',
  type: 'dir'
}

describe('indexMark (3K.5)', () => {
  it('файл отмечен или нет', () => {
    const file = { name: 'КР.md', path: 'wiki/КР.md', type: 'file' } as const

    expect(indexMark(file, new Set(['wiki/КР.md']))).toBe('all')
    expect(indexMark(file, new Set())).toBe('none')
  })

  it('папка — по файлам под ней, на любой глубине', () => {
    expect(indexMark(wiki, new Set())).toBe('none')
    expect(indexMark(wiki, new Set(['wiki/разделы/ОВ.md']))).toBe('some')
    expect(indexMark(wiki, new Set(['wiki/КР.md', 'wiki/разделы/ОВ.md']))).toBe('all')
  })

  it('имя-приставка соседней папки не считается: wiki2 не внутри wiki', () => {
    expect(indexMark(wiki, new Set(['wiki2/a.md']))).toBe('none')
  })

  it('отмеченный файл, которого в папке уже нет, — «частично»: снять можно отсюда', () => {
    expect(indexMark(wiki, new Set(['wiki/удалённый.md']))).toBe('some')
  })
})
