// Задача 3.13b (SPEC UR20). Проверяется главное обещание: когда ядро на другой
// машине, файл читается ТАМ — и ни один ответ не выдаёт местный файл за него.
// Ответ ядра подменяется; предмет проверки — что мы у него спрашиваем и как
// пересказываем ответ человеку.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const rest = vi.fn()

vi.mock('./hermes-rest', () => ({
  hermesRest: (...args: unknown[]) => rest(...args)
}))

const { readRemoteDataUrl, readRemoteDocument, statRemoteFile } = await import('./remote-files')

const TARGET = { host: '', port: 0, token: 't', baseUrl: 'https://core.example.org' }

function dataUrl(mime: string, text: string): string {
  return `data:${mime};base64,${Buffer.from(text, 'utf-8').toString('base64')}`
}

// Фигурные скобки здесь обязательны: `() => rest.mockReset()` вернул бы саму
// подделку, а vitest считает функцию, возвращённую из хука, УБОРЩИКОМ и зовёт
// её после теста. С подделкой, настроенной бросать, этот вызов давал отказ,
// который никто не ждал, — и тест падал с ошибкой, которую сам же и проверял.
beforeEach(() => {
  rest.mockReset()
})

describe('чтение документа с машины ядра', () => {
  it('спрашивается именно тот путь, что пришёл, — и у файлового API ядра', async () => {
    rest.mockResolvedValue({ dataUrl: dataUrl('text/plain', 'привет') })

    await readRemoteDocument(TARGET, '/srv/docs/см.txt')

    expect(rest).toHaveBeenCalledWith(TARGET, '/api/fs/read-data-url', {
      query: { path: '/srv/docs/см.txt' },
      timeoutMs: 60_000
    })
  })

  it('байты доезжают целыми, а имя берётся из пути той машины', async () => {
    rest.mockResolvedValue({ dataUrl: dataUrl('text/plain', 'привет') })

    const result = await readRemoteDocument(TARGET, '/srv/docs/письмо.txt')

    expect(result.ok).toBe(true)
    expect(Buffer.from(result.bytes as ArrayBuffer).toString('utf-8')).toBe('привет')
    expect(result.name).toBe('письмо.txt')
    expect(result.size).toBe(Buffer.byteLength('привет', 'utf-8'))
  })

  it('путь с чужим разделителем тоже даёт имя', async () => {
    rest.mockResolvedValue({ dataUrl: dataUrl('text/plain', 'x') })

    const result = await readRemoteDocument(TARGET, 'C:\\docs\\смета.xlsx')

    expect(result.name).toBe('смета.xlsx')
  })

  it('отказ ядра пересказывается словами, а не кодом', async () => {
    rest.mockImplementation(async () => {
      throw new Error('hermes REST 413: File too large')
    })

    const result = await readRemoteDocument(TARGET, '/srv/огромный.pdf')

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Файл слишком велик для просмотра')
  })

  it('непонятный ответ — отказ, а не пустой документ', async () => {
    rest.mockResolvedValue({ dataUrl: 'не адрес' })

    expect((await readRemoteDocument(TARGET, '/x')).ok).toBe(false)
  })
})

describe('картинка для предпросмотра', () => {
  it('отдаётся как есть — окну не нужно знать, откуда она', async () => {
    const url = dataUrl('image/png', 'PNG')
    rest.mockResolvedValue({ dataUrl: url })

    expect(await readRemoteDataUrl(TARGET, '/srv/plan.png')).toEqual({ ok: true, dataUrl: url })
  })

  it('мусор вместо картинки — отказ', async () => {
    rest.mockResolvedValue({ dataUrl: '' })

    expect((await readRemoteDataUrl(TARGET, '/srv/plan.png')).ok).toBe(false)
  })
})

describe('есть ли файл на машине ядра', () => {
  it('есть — с размером', async () => {
    rest.mockResolvedValue({ byteSize: 4096 })

    expect(await statRemoteFile(TARGET, '/srv/отчёт.md')).toEqual({
      exists: true,
      isFile: true,
      size: 4096
    })
  })

  it('слишком велик — это ЕСТЬ, а не «нет файла»', async () => {
    rest.mockImplementation(async () => {
      throw new Error('hermes REST 413: File too large')
    })

    expect(await statRemoteFile(TARGET, '/srv/огромный.bin')).toEqual({
      exists: true,
      isFile: true,
      size: 0
    })
  })

  it('папка — есть, но не файл', async () => {
    rest.mockImplementation(async () => {
      throw new Error('Path points to a directory')
    })

    expect(await statRemoteFile(TARGET, '/srv/папка')).toEqual({
      exists: true,
      isFile: false,
      size: 0
    })
  })

  it('нет — значит нет', async () => {
    rest.mockImplementation(async () => {
      throw new Error('hermes REST 404: Not Found')
    })

    expect(await statRemoteFile(TARGET, '/srv/нет.txt')).toEqual({
      exists: false,
      isFile: false,
      size: 0
    })
  })
})
