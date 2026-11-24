// Task T88 debt: a deleted profile's preview cookie jar is cleared (fake sessions, no Electron).

import type { Session } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { previewPartitionForProfile } from '../renderer/src/donor/hermes-electron/preview-guest-throttle'
import { clearPreviewJarForProfile } from './preview-guest-activity'

function fakeJar() {
  return {
    clearStorageData: vi.fn(async () => undefined),
    clearCache: vi.fn(async () => undefined)
  }
}

describe('clearPreviewJarForProfile', () => {
  it('clears the whole jar of a deleted profile', async () => {
    const jar = fakeJar()
    const resolve = vi.fn(() => jar as unknown as Session)
    expect(await clearPreviewJarForProfile('engineer', previewPartitionForProfile, resolve)).toBe(
      true
    )
    expect(resolve).toHaveBeenCalledWith('persist:hermes-preview-engineer')
    expect(jar.clearStorageData).toHaveBeenCalledTimes(1)
    expect(jar.clearCache).toHaveBeenCalledTimes(1)
  })

  it('never clears the default profile jar', async () => {
    const resolve = vi.fn(() => fakeJar() as unknown as Session)
    expect(await clearPreviewJarForProfile('default', previewPartitionForProfile, resolve)).toBe(
      false
    )
    expect(resolve).not.toHaveBeenCalled()
  })
})
