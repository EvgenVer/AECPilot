// Задача 3.27. Проверяется то, что человек может сломать или чем может
// воспользоваться чужой текст: адрес картинки, который написала модель, и имя
// файла, которое подставляет окно.

import { describe, expect, it } from 'vitest'

import {
  classifySaveSource,
  extensionForMediaType,
  planSaveDialog,
  readDataUrl,
  safeFileName,
  SAVE_REMOTE_REFUSED
} from './save-out-pure'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

describe('откуда берётся картинка', () => {
  it('data: — это байты, их сохраняем', () => {
    expect(classifySaveSource(PNG)).toEqual({
      kind: 'bytes',
      base64: 'iVBORw0KGgo=',
      suggestedName: 'image.png'
    })
  })

  it('адрес в интернете — отказ со ссылкой на браузер, а не тихая загрузка', () => {
    expect(classifySaveSource('https://example.com/cat.png')).toEqual({
      kind: 'refused',
      error: SAVE_REMOTE_REFUSED
    })
    expect(classifySaveSource('HTTP://example.com/cat.png').kind).toBe('refused')
  })

  it('чужая схема отказывается по имени — отказ должен читаться', () => {
    const refusal = classifySaveSource('javascript:alert(1)')
    expect(refusal.kind).toBe('refused')
    expect(refusal.kind === 'refused' && refusal.error).toContain('javascript:')
  })

  it('локальный путь уходит на проверку принадлежности проекту', () => {
    expect(classifySaveSource('reports/plan.png')).toEqual({
      kind: 'path',
      value: 'reports/plan.png',
      suggestedName: 'plan.png'
    })
  })

  it('file:// — тоже путь, и имя берётся расшифрованным', () => {
    expect(classifySaveSource('file:///C:/work/%D0%BF%D0%BB%D0%B0%D0%BD.png')).toEqual({
      kind: 'path',
      value: 'file:///C:/work/%D0%BF%D0%BB%D0%B0%D0%BD.png',
      suggestedName: 'план.png'
    })
  })

  it('пустое и не-строка — отказ, а не падение', () => {
    expect(classifySaveSource(undefined).kind).toBe('refused')
    expect(classifySaveSource('   ').kind).toBe('refused')
  })

  it('управляющие символы в адресе — отказ (то же правило, что у артефактов)', () => {
    expect(classifySaveSource('reports/pl\u0000an.png').kind).toBe('refused')
  })

  it('испорченный data: не становится файлом с мусором', () => {
    expect(classifySaveSource('data:image/png,not-base64').kind).toBe('refused')
    expect(classifySaveSource('data:image/png;base64,!!!').kind).toBe('refused')
  })
})

describe('readDataUrl', () => {
  it('тип без параметров читается', () => {
    expect(readDataUrl('data:image/gif;base64,R0lGOD')).toEqual({
      mediaType: 'image/gif',
      base64: 'R0lGOD'
    })
  })

  it('base64 может быть не последним параметром', () => {
    expect(readDataUrl('data:image/png;charset=utf-8;base64,AAA')?.mediaType).toBe('image/png')
  })

  it('без типа — октеты, а не догадка', () => {
    expect(readDataUrl('data:;base64,AAA')?.mediaType).toBe('application/octet-stream')
  })
})

describe('расширение по типу содержимого', () => {
  it('известные типы', () => {
    expect(extensionForMediaType('image/jpeg')).toBe('jpg')
    expect(extensionForMediaType('IMAGE/SVG+XML')).toBe('svg')
    expect(extensionForMediaType('image/vnd.microsoft.icon')).toBe('ico')
  })

  it('незнакомый тип берёт свой подтип, а не притворяется png', () => {
    expect(extensionForMediaType('image/heic')).toBe('heic')
    expect(extensionForMediaType('image/x-tga')).toBe('tga')
  })

  it('мусор становится .bin', () => {
    expect(extensionForMediaType('нечто')).toBe('bin')
  })
})

describe('имя файла для диалога', () => {
  it('от пути остаётся только имя — папку выбирает человек', () => {
    expect(safeFileName('C:\\Windows\\System32\\drivers\\etc\\hosts', 'x')).toBe('hosts')
    expect(safeFileName('../../../secret.txt', 'x')).toBe('secret.txt')
  })

  it('знаки, которые Windows не принимает, убираются', () => {
    expect(safeFileName('от"чёт<>|?*.png', 'x')).toBe('отчёт.png')
  })

  it('точка и пробел в конце убираются — иначе файл окажется не там, где назван', () => {
    expect(safeFileName('report.png. ', 'x')).toBe('report.png')
  })

  it('управляющие символы убираются', () => {
    expect(safeFileName('re\u0007port.png', 'x')).toBe('report.png')
  })

  it('пустое и не-строка дают запасное имя', () => {
    expect(safeFileName('', 'untitled')).toBe('untitled')
    expect(safeFileName('///', 'untitled')).toBe('untitled')
    expect(safeFileName(42, 'untitled')).toBe('untitled')
  })

  it('очень длинное имя обрезается', () => {
    expect(safeFileName(`${'a'.repeat(400)}.png`, 'x')).toHaveLength(120)
  })
})

describe('план диалога сохранения', () => {
  it('подсказка имени не может принести с собой папку', () => {
    expect(planSaveDialog({ defaultPath: 'C:\\Windows\\System32\\evil.exe' }, 'untitled')).toEqual({
      defaultPath: 'evil.exe'
    })
  })

  it('заголовок и фильтры проходят, пустые — нет', () => {
    expect(
      planSaveDialog(
        { title: 'Экспорт профиля', filters: [{ name: 'profile', extensions: ['tar.gz'] }] },
        'untitled'
      )
    ).toEqual({
      defaultPath: 'untitled',
      title: 'Экспорт профиля',
      filters: [{ name: 'profile', extensions: ['tar.gz'] }]
    })
  })

  it('запрос без полей всё равно даёт имя', () => {
    expect(planSaveDialog(undefined, 'untitled')).toEqual({ defaultPath: 'untitled' })
  })
})
