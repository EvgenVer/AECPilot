import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertRefs = vi.fn()
const focus = vi.fn()
const notifyError = vi.fn()

vi.mock('../../donor/app/chat/composer/focus', () => ({
  requestComposerFocus: (...args: unknown[]) => focus(...args),
  requestComposerInsertRefs: (...args: unknown[]) => insertRefs(...args)
}))
vi.mock('../../donor/store/notifications', () => ({
  notifyError: (...args: unknown[]) => notifyError(...args)
}))

import { mentionInChat, mentionRef } from './mention-in-chat'

// Задача T79 (UR54): плашка с именем — человеку, точный адрес — агенту.
describe('упомянуть в чате', () => {
  beforeEach(() => {
    insertRefs.mockClear()
    focus.mockClear()
    notifyError.mockClear()
  })

  it('файл: вид path, адрес целиком, подпись — имя', () => {
    expect(mentionRef('D:\\ЮП\\wiki\\ПЗ.md', 'ПЗ.md', false)).toEqual({
      kind: 'path',
      label: 'ПЗ.md',
      value: 'D:\\ЮП\\wiki\\ПЗ.md'
    })
  })

  it('папка подписана с косой чертой', () => {
    expect(mentionRef('\\\\srv\\КР\\лист 1', 'лист 1', true).label).toBe('лист 1/')
  })

  it('вставляет плашку в активное поле и ставит туда фокус', async () => {
    const ok = await mentionInChat(
      async () => ({ ok: true, path: 'D:\\ЮП\\план.pdf' }),
      'план.pdf',
      false,
      'Не упомянуть'
    )
    expect(ok).toBe(true)
    expect(insertRefs).toHaveBeenCalledWith([
      { kind: 'path', label: 'план.pdf', value: 'D:\\ЮП\\план.pdf' }
    ])
    expect(focus).toHaveBeenCalledWith('active')
  })

  it('отказ главного процесса — уведомление словами, плашки нет', async () => {
    const ok = await mentionInChat(
      async () => ({ ok: false, error: 'Путь вне проекта' }),
      'x',
      false,
      'Не упомянуть'
    )
    expect(ok).toBe(false)
    expect(insertRefs).not.toHaveBeenCalled()
    expect(notifyError).toHaveBeenCalledWith('Путь вне проекта', 'Не упомянуть')
  })
})
