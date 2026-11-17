import { describe, expect, it } from 'vitest'

import { isNetworkPath, locateDocument } from './document-locate-pure'

// Задача T77 (UR55): ссылка агента на файл проекта — пара «корень + путь» для
// окна документов; чужой файл — `null`, его открывает предпросмотр.
describe('locateDocument', () => {
  const vault = ['D:\\Проекты\\ЮП', 'E:\\настоящий\\ЮП']
  const sources = [{ roots: ['\\\\srv\\исходные\\КР'], sourceId: 'src-1' }]

  it('файл хранилища — относительный путь без id источника', () => {
    expect(locateDocument('D:\\Проекты\\ЮП\\wiki\\ПЗ.md', vault, sources)).toEqual({
      relPath: 'wiki/ПЗ.md'
    })
  })

  it('по настоящему адресу хранилища (после realpath) — тот же файл', () => {
    expect(locateDocument('E:\\настоящий\\ЮП\\notes\\a.pdf', vault, sources)).toEqual({
      relPath: 'notes/a.pdf'
    })
  })

  it('файл источника — путь внутри источника и его id', () => {
    expect(locateDocument('\\\\srv\\исходные\\КР\\лист 1\\план.pdf', vault, sources)).toEqual({
      relPath: 'лист 1/план.pdf',
      sourceId: 'src-1'
    })
  })

  it('источник внутри хранилища — файл принадлежит источнику', () => {
    const nested = [{ roots: ['D:\\Проекты\\ЮП\\исходные'], sourceId: 'src-2' }]
    expect(locateDocument('D:\\Проекты\\ЮП\\исходные\\ТЗ.docx', vault, nested)).toEqual({
      relPath: 'ТЗ.docx',
      sourceId: 'src-2'
    })
  })

  it('файл вне проекта и выход через .. — null', () => {
    expect(locateDocument('C:\\Users\\x\\отчёт.pdf', vault, sources)).toBeNull()
    expect(locateDocument('D:\\Проекты\\ЮП\\..\\чужой\\a.md', vault, sources)).toBeNull()
    expect(locateDocument('D:\\Проекты\\ЮП', vault, sources)).toBeNull()
  })

  it('сетевые пути распознаются, локальные — нет', () => {
    expect(isNetworkPath('\\\\evil\\share\\a.pdf')).toBe(true)
    expect(isNetworkPath('\\\\?\\C:\\a.pdf')).toBe(true)
    expect(isNetworkPath('//evil/share/a.pdf')).toBe(true)
    expect(isNetworkPath('C:\\p\\a.pdf')).toBe(false)
  })
})
