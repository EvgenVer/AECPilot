import { describe, expect, it } from 'vitest'

import { readClipboardImagePng, type ClipboardReader } from './clipboard-image-pure'

const blob = (bytes: number[]) => ({
  arrayBuffer: async () => new Uint8Array(bytes).buffer
})

const reader = (items: Awaited<ReturnType<ClipboardReader['read']>>): ClipboardReader => ({
  read: async () => items
})

describe('readClipboardImagePng (Electron 44 clipboard)', () => {
  it('returns the PNG bytes of the first item that has them', async () => {
    const png = await readClipboardImagePng(
      reader([
        { types: ['text/plain'], getType: async () => blob([1]) },
        { types: ['image/png'], getType: async () => blob([137, 80, 78, 71]) }
      ])
    )
    expect(png && [...png]).toEqual([137, 80, 78, 71])
  })

  it('answers null when there is no image', async () => {
    expect(
      await readClipboardImagePng(
        reader([{ types: ['text/plain'], getType: async () => blob([1]) }])
      )
    ).toBeNull()
    expect(await readClipboardImagePng(reader([]))).toBeNull()
  })

  it('answers null when the read itself rejects', async () => {
    expect(
      await readClipboardImagePng({ read: async () => Promise.reject(new Error('busy')) })
    ).toBeNull()
  })

  it('treats an empty image as no image and skips a type that vanished', async () => {
    expect(
      await readClipboardImagePng(reader([{ types: ['image/png'], getType: async () => blob([]) }]))
    ).toBeNull()
    const png = await readClipboardImagePng(
      reader([
        { types: ['image/png'], getType: async () => Promise.reject(new Error('gone')) },
        { types: ['image/png'], getType: async () => blob([9]) }
      ])
    )
    expect(png && [...png]).toEqual([9])
  })
})
