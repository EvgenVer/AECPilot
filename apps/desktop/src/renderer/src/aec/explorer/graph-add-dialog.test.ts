import { describe, expect, it } from 'vitest'

import { forecastVerdict } from './GraphAddDialog'

// Чек-лист 40.2.2: если документы ещё не индексировались, окно говорит именно
// это, и соглашаться не на что — кнопки «Добавить» нет.
describe('forecastVerdict', () => {
  it('индекса нет вовсе — «не проиндексировано»', () => {
    expect(forecastVerdict({ documents: 3, index_missing: true, not_indexed: 0 })).toBe(
      'index-missing'
    )
  })

  it('ни один выбранный документ не проиндексирован — тоже «не проиндексировано»', () => {
    expect(forecastVerdict({ documents: 1, not_indexed: 1 })).toBe('index-missing')
  })

  it('часть не проиндексирована — прогноз с предупреждением, согласие есть', () => {
    expect(forecastVerdict({ documents: 3, not_indexed: 1 })).toBe('ready')
  })

  it('документов нет — «добавлять нечего»', () => {
    expect(forecastVerdict({ documents: 0, not_indexed: 0 })).toBe('nothing')
  })
})
