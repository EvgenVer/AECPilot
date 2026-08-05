import { describe, expect, it, vi } from 'vitest'
import { createI18nConfigClient, readStoredLocale } from './config-client'

function memoryStorage(initial?: string): Storage {
  const map = new Map<string, string>()
  if (initial !== undefined) map.set('aecpilot.ui-language', initial)
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    }
  } as unknown as Storage
}

describe('readStoredLocale', () => {
  it('defaults to Russian when nothing has been chosen', () => {
    expect(readStoredLocale(memoryStorage())).toBe('ru')
    expect(readStoredLocale(memoryStorage(''))).toBe('ru')
  })

  it('reads the preference the app stored before this migration', () => {
    expect(readStoredLocale(memoryStorage('en'))).toBe('en')
  })

  it('normalizes a regional tag to the locale we carry', () => {
    expect(readStoredLocale(memoryStorage('ru-RU'))).toBe('ru')
    expect(readStoredLocale(memoryStorage('EN-US'))).toBe('en')
  })

  it('falls back to English for a locale this build does not carry', () => {
    // Their `normalizeLocale` contract: unknown → DEFAULT_LOCALE. Only a value
    // that was never set falls to ours.
    expect(readStoredLocale(memoryStorage('pt-BR'))).toBe('en')
  })

  it('survives a storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      }
    } as unknown as Storage
    expect(readStoredLocale(throwing)).toBe('ru')
  })
})

describe('createI18nConfigClient', () => {
  it('reports the stored locale in the shape their provider reads', async () => {
    const client = createI18nConfigClient(memoryStorage('en'))
    await expect(client.getConfig()).resolves.toEqual({ display: { language: 'en' } })
  })

  it('persists a switch', async () => {
    const storage = memoryStorage()
    const client = createI18nConfigClient(storage)

    await expect(client.saveConfig({ display: { language: 'en' } })).resolves.toEqual({ ok: true })

    expect(storage.getItem('aecpilot.ui-language')).toBe('en')
    await expect(client.getConfig()).resolves.toEqual({ display: { language: 'en' } })
  })

  it('reports success even when the write is refused — the session still switches', async () => {
    const storage = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error('quota')
      })
    } as unknown as Storage

    await expect(
      createI18nConfigClient(storage).saveConfig({ display: { language: 'en' } })
    ).resolves.toEqual({ ok: true })
  })
})
