// Приёмка 2026-10-08: после «Начать» их окно подключения провайдера оставалось
// растворённым навсегда, и вход по подписке в той же сессии шёл невидимо. Решение
// владельца — перезагрузить окно после «Начать».
import { atom } from 'nanostores'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { finishedWithBegin, reloadAfterBegin } from './reload-after-begin'

const CONFIRMING = { configured: false, manual: false, flow: { status: 'confirming_model' } }
const DONE = { configured: true, manual: false, flow: { status: 'idle' } }

describe('«Начать» в окне подключения провайдера', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('признак — завершение сразу после шага подтверждения модели', () => {
    expect(finishedWithBegin(CONFIRMING, DONE)).toBe(true)
    expect(finishedWithBegin({ ...CONFIRMING, manual: true }, DONE)).toBe(true)
  })

  it('прочие переходы — не «Начать»', () => {
    // Отмена из ручного окна: остаётся ручным или не становится «настроено».
    expect(finishedWithBegin(CONFIRMING, { ...DONE, manual: true })).toBe(false)
    expect(finishedWithBegin(CONFIRMING, { ...DONE, configured: false })).toBe(false)
    // Обычный запуск уже настроенного приложения.
    expect(finishedWithBegin({ ...DONE, configured: null }, DONE)).toBe(false)
    // Вход по подписке начался — это не завершение.
    expect(finishedWithBegin(DONE, { ...DONE, flow: { status: 'polling' } })).toBe(false)
  })

  it('перезагружает окно один раз', () => {
    const store = atom<typeof DONE>(CONFIRMING)
    const reload = vi.fn()
    reloadAfterBegin(store, reload)
    store.set(DONE)
    vi.advanceTimersByTime(300)
    expect(reload).toHaveBeenCalledOnce()
    store.set({ ...DONE })
    vi.advanceTimersByTime(300)
    expect(reload).toHaveBeenCalledOnce()
  })
})
