// Задача 3E.25. Наблюдатель на настоящем диске: `fs.watch` — та часть, где
// «должно работать» и «работает» расходятся чаще всего (замена файла вместо
// записи, событие без имени, папка исчезла).
//
// Окно подменено заглушкой: тесту нужен только адресат события и признак
// «окно живо», а поднимать Electron ради двух полей значило бы проверять
// Electron.

import fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  previewWatchCount,
  startPreviewWatch,
  stopPreviewWatch,
  stopPreviewWatchesFor
} from './preview-watch'

interface Sent {
  channel: string
  payload: { id: string; path: string; url: string }
}

function fakeWindow(id = 1): { sender: WebContents; sent: Sent[]; destroy: () => void } {
  const sent: Sent[] = []
  let destroyed = false
  const handlers: (() => void)[] = []

  const sender = {
    id,
    isDestroyed: () => destroyed,
    once: (event: string, handler: () => void) => {
      if (event === 'destroyed') handlers.push(handler)
    },
    send: (channel: string, payload: Sent['payload']) => sent.push({ channel, payload })
  } as unknown as WebContents

  return {
    sender,
    sent,
    destroy: () => {
      destroyed = true
      handlers.forEach((handler) => handler())
    }
  }
}

/** Ждёт события, а не спит фиксированно: `fs.watch` приходит когда придёт. */
async function waitFor(check: () => boolean, ms = 4000): Promise<boolean> {
  const deadline = Date.now() + ms

  while (Date.now() < deadline) {
    if (check()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }

  return check()
}

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aec-watch-'))
})

afterEach(() => {
  for (let guard = 0; guard < 10 && previewWatchCount() > 0; guard += 1) {
    stopPreviewWatchesFor(1)
    stopPreviewWatchesFor(2)
  }
  rmSync(dir, { force: true, recursive: true })
})

describe('startPreviewWatch', () => {
  it('правка файла доезжает до окна с его id, путём и адресом', async () => {
    const file = join(dir, 'отчёт.html')
    fs.writeFileSync(file, '<p>один</p>', 'utf-8')

    const window = fakeWindow()
    const watch = startPreviewWatch(file, window.sender)

    expect(watch.path).toBe(file)

    fs.writeFileSync(file, '<p>два</p>', 'utf-8')

    expect(await waitFor(() => window.sent.length > 0), 'события о правке не пришло').toBe(true)
    expect(window.sent[0]).toEqual({
      channel: 'preview:file-changed',
      payload: { id: watch.id, path: file, url: pathToFileURL(file).toString() }
    })
  })

  it('сохранение ЗАМЕНОЙ тоже ловится — ради этого наблюдатель стоит на папке', async () => {
    // Так сохраняют редакторы и генераторы: пишут рядом и переименовывают.
    // Наблюдатель на самом файле после замены смотрел бы на исчезнувший inode.
    const file = join(dir, 'смета.md')
    fs.writeFileSync(file, 'старое', 'utf-8')

    const window = fakeWindow()
    startPreviewWatch(file, window.sender)

    const temporary = join(dir, 'смета.md.tmp')
    fs.writeFileSync(temporary, 'новое', 'utf-8')
    fs.renameSync(temporary, file)

    expect(await waitFor(() => window.sent.length > 0), 'замена файла прошла незамеченной').toBe(
      true
    )
  })

  it('правка СОСЕДНЕГО файла окно не будит', async () => {
    const file = join(dir, 'отчёт.html')
    fs.writeFileSync(file, 'один', 'utf-8')

    const window = fakeWindow()
    startPreviewWatch(file, window.sender)

    fs.writeFileSync(join(dir, 'посторонний.txt'), 'что-то', 'utf-8')

    // Ждём столько же, сколько ждали бы своего события: «не пришло» надо
    // доказывать временем, а не мгновенной проверкой.
    await waitFor(() => window.sent.length > 0, 600)

    expect(window.sent).toEqual([])
  })
})

describe('stopPreviewWatch', () => {
  it('снятое слежение освобождает наблюдателя, и повторное открытие их не копит', async () => {
    const file = join(dir, 'отчёт.html')
    fs.writeFileSync(file, 'один', 'utf-8')

    const window = fakeWindow()
    const before = previewWatchCount()

    for (let round = 0; round < 5; round += 1) {
      const watch = startPreviewWatch(file, window.sender)

      expect(previewWatchCount()).toBe(before + 1)
      expect(stopPreviewWatch(watch.id)).toBe(true)
      expect(previewWatchCount()).toBe(before)
    }
  })

  it('повторное снятие отвечает false, а не делает вид', () => {
    const file = join(dir, 'отчёт.html')
    fs.writeFileSync(file, 'один', 'utf-8')

    const watch = startPreviewWatch(file, fakeWindow().sender)

    expect(stopPreviewWatch(watch.id)).toBe(true)
    expect(stopPreviewWatch(watch.id)).toBe(false)
    expect(stopPreviewWatch('которого-нет')).toBe(false)
  })

  it('после правки СНЯТОГО слежения окну больше ничего не приходит', async () => {
    const file = join(dir, 'отчёт.html')
    fs.writeFileSync(file, 'один', 'utf-8')

    const window = fakeWindow()
    const watch = startPreviewWatch(file, window.sender)

    stopPreviewWatch(watch.id)
    fs.writeFileSync(file, 'два', 'utf-8')
    await waitFor(() => window.sent.length > 0, 600)

    expect(window.sent).toEqual([])
  })

  it('закрытое окно снимает своё слежение само', () => {
    // Их панель снимает слежение в размонтировании, а закрытое окно
    // размонтирования не делает — иначе наблюдатель остался бы навсегда.
    const file = join(dir, 'отчёт.html')
    fs.writeFileSync(file, 'один', 'utf-8')

    const window = fakeWindow(2)
    const before = previewWatchCount()

    startPreviewWatch(file, window.sender)
    expect(previewWatchCount()).toBe(before + 1)

    window.destroy()

    expect(previewWatchCount()).toBe(before)
  })
})
