import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  isInsideAttachmentsDir,
  MAX_ATTACHMENT_BYTES,
  mediaTypeFor,
  normalizeExtension,
  readAttachmentDataUrl,
  saveAttachment
} from './attachments'

let dir = ''

afterEach(() => {
  if (dir) fs.rmSync(dir, { force: true, recursive: true })
  dir = ''
})

function makeDir(): string {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-attachments-'))
  return dir
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe('saveAttachment (задача 4D-15)', () => {
  it('пишет байты и возвращает путь внутри своей папки', async () => {
    const root = makeDir()

    const saved = await saveAttachment(root, PNG, 'png')

    expect(path.dirname(saved)).toBe(root)
    expect(path.extname(saved)).toBe('.png')
    expect(new Uint8Array(fs.readFileSync(saved))).toEqual(PNG)
  })

  it('не даёт рендереру выбрать расширение', async () => {
    const root = makeDir()

    // Расширение попадает в имя файла на диске пользователя. Окно не то место,
    // где решают, что это будет `.exe`.
    const saved = await saveAttachment(root, PNG, 'exe')

    expect(path.extname(saved)).toBe('.bin')
  })

  it('отказывает пустому и слишком большому файлу', async () => {
    const root = makeDir()

    await expect(saveAttachment(root, new Uint8Array(), 'png')).rejects.toThrow('пустой')
    await expect(
      saveAttachment(root, new Uint8Array(MAX_ATTACHMENT_BYTES + 1), 'png')
    ).rejects.toThrow('слишком велик')
  })

  it('не сталкивает два вложения с одинаковым именем', async () => {
    const root = makeDir()

    const first = await saveAttachment(root, PNG, 'png')
    const second = await saveAttachment(root, PNG, 'png')

    expect(first).not.toBe(second)
  })
})

describe('readAttachmentDataUrl (задача 4D-15)', () => {
  it('читает то, что сам записал', async () => {
    const root = makeDir()
    const saved = await saveAttachment(root, PNG, 'png')

    const url = await readAttachmentDataUrl(root, saved)

    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(Buffer.from(url.split(',')[1], 'base64')).toEqual(Buffer.from(PNG))
  })

  it('отказывается быть читалкой чужих файлов', async () => {
    const root = makeDir()
    const outside = path.join(root, '..', 'посторонний.txt')
    fs.writeFileSync(outside, 'секрет', 'utf-8')

    try {
      // Ровно та привилегия, которую 4D-11 забрала на записи: окно не должно
      // получить её обратно на чтении.
      await expect(readAttachmentDataUrl(root, outside)).rejects.toThrow('только вложения')
      await expect(
        readAttachmentDataUrl(root, 'C:\\Windows\\System32\\drivers\\etc\\hosts')
      ).rejects.toThrow('только вложения')
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })

  it('не пускает через `..` обратно внутрь чужой папки', () => {
    const root = makeDir()

    expect(isInsideAttachmentsDir(root, path.join(root, '..', 'соседняя', 'файл.png'))).toBe(false)
    expect(isInsideAttachmentsDir(root, path.join(root, 'подпапка', 'файл.png'))).toBe(false)
    expect(isInsideAttachmentsDir(root, root)).toBe(false)
    expect(isInsideAttachmentsDir(root, path.join(root, 'файл.png'))).toBe(true)
  })
})

describe('вспомогательные', () => {
  it.each([
    ['PNG', 'png'],
    ['.JPG', 'jpg'],
    ['  webp  ', 'webp'],
    ['exe', 'bin'],
    // Задача 3E.26: выгруженная вкладка предпросмотра. Не картинка — и именно
    // поэтому записано отдельной строкой, а не растворено в списке.
    ['.html', 'html'],
    ['', 'bin'],
    [undefined, 'bin']
  ])('normalizeExtension(%s) = %s', (raw, expected) => {
    expect(normalizeExtension(raw)).toBe(expected)
  })

  it('называет тип по расширению, а неизвестное — октет-потоком', () => {
    expect(mediaTypeFor('x.png')).toBe('image/png')
    expect(mediaTypeFor('x.JPEG')).toBe('image/jpeg')
    expect(mediaTypeFor('x.bin')).toBe('application/octet-stream')
    expect(mediaTypeFor('x.html')).toBe('text/html')
  })
})

// Задача 3.13b. При удалённом ядре вложение уезжает БАЙТАМИ: путь этой машины
// на той не значит ничего. Читать их может только главный процесс — и только
// потому, что этот файл человек выбрал сам в его же диалоге.
describe('файл, выбранный человеком', () => {
  it('читается — иначе вложение при удалённом ядре не уедет вовсе', async () => {
    const root = makeDir()
    const outside = path.join(root, 'не-вложение.png')
    fs.writeFileSync(outside, Buffer.from([1, 2, 3]))

    const dataUrl = await readAttachmentDataUrl(
      path.join(root, 'attachments'),
      outside,
      (candidate) => candidate === outside
    )

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('чужой путь по-прежнему не читается — общего чтения файлов окну не дано', async () => {
    const root = makeDir()
    const outside = path.join(root, 'секрет.png')
    fs.writeFileSync(outside, Buffer.from([1]))

    await expect(
      readAttachmentDataUrl(path.join(root, 'attachments'), outside, () => false)
    ).rejects.toThrow(/выбранные вами/)
  })

  it('без разрешающей проверки поведение прежнее', async () => {
    const root = makeDir()
    const outside = path.join(root, 'ещё.png')
    fs.writeFileSync(outside, Buffer.from([1]))

    await expect(readAttachmentDataUrl(path.join(root, 'attachments'), outside)).rejects.toThrow()
  })
})
