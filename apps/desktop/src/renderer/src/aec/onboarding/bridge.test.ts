// D-116: «Подставить вопрос» мастера и «Обновить вики» в уведомлении скана
// кладут текст в поле ввода через `fillComposer`. Кладут — в главное поле и через
// шину, которую поле слушает; отправлять не должны.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const focus = vi.hoisted(() => ({
  requestComposerFocus: vi.fn(),
  requestComposerInsert: vi.fn(),
  requestComposerSubmit: vi.fn()
}))
vi.mock('../../donor/app/chat/composer/focus', () => focus)
// Их стор онбординга тянет весь клиент шлюза (урок D-31) — здесь он не нужен.
vi.mock('../../donor/store/onboarding', () => ({
  $desktopOnboarding: { get: () => ({ configured: false }), subscribe: () => () => {} },
  startManualOnboarding: vi.fn()
}))

import { fillComposer } from './bridge'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fillComposer', () => {
  it('вставляет текст в главное поле ввода и ставит в него курсор', () => {
    fillComposer('Что ты умеешь?')
    expect(focus.requestComposerInsert).toHaveBeenCalledWith('Что ты умеешь?', { target: 'main' })
    expect(focus.requestComposerFocus).toHaveBeenCalledWith('main')
  })

  it('ничего не отправляет — отправляет человек', () => {
    fillComposer('Что ты умеешь?')
    expect(focus.requestComposerSubmit).not.toHaveBeenCalled()
  })
})
