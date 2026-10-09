import { describe, expect, it } from 'vitest'

import { folderName, sourceDisplayName } from './source-name'

describe('folderName (3J.5)', () => {
  it('имя конечной папки — Windows, posix, сетевой путь, хвостовой разделитель', () => {
    expect(folderName('D:\\Проекты\\Нагатинская\\Изыскания')).toBe('Изыскания')
    expect(folderName('/home/eng/КР/')).toBe('КР')
    expect(folderName('\\\\server\\share\\2024\\Нагатинская')).toBe('Нагатинская')
    expect(folderName('C:/work/docs\\')).toBe('docs')
  })

  it('корень диска остаётся путём', () => {
    expect(folderName('D:\\')).toBe('D:\\')
    expect(folderName('D:')).toBe('D:')
  })
})

describe('sourceDisplayName', () => {
  it('без названия — имя папки, с названием — оно', () => {
    expect(sourceDisplayName({ root_path: 'D:\\a\\Изыскания' })).toBe('Изыскания')
    expect(sourceDisplayName({ root_path: 'D:\\a\\Изыскания', label: 'ИГИ' })).toBe('ИГИ')
  })

  it('пустое название — как отсутствующее', () => {
    expect(sourceDisplayName({ root_path: 'D:\\a\\b', label: '  ' })).toBe('b')
  })
})
