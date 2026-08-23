// Задачи 3.7a/3.7b. Проверяется то, ради чего правка построчная: чужой файл,
// который человек читает и правит руками, должен пережить нашу запись целиком —
// с комментариями, порядком и уже сделанным выбором.

import { describe, expect, it } from 'vitest'

import { ensureSectionScalar } from './config-yaml-pure'

describe('дописать поле в их конфиг', () => {
  it('секции нет — добавляется целиком', () => {
    const result = ensureSectionScalar('model:\n  name: x\n', 'wake_word', 'phrase', 'hey pilot')

    expect(result.changed).toBe(true)
    expect(result.text).toContain('wake_word:')
    expect(result.text).toContain('phrase: "hey pilot"')
    expect(result.text, 'соседняя секция цела').toContain('model:')
  })

  it('секция есть, ключа нет — добавляется ключ', () => {
    const result = ensureSectionScalar(
      'wake_word:\n  enabled: true\n',
      'wake_word',
      'phrase',
      'hey pilot'
    )

    expect(result.changed).toBe(true)
    expect(result.text).toContain('  phrase: "hey pilot"')
    expect(result.text).toContain('  enabled: true')
  })

  it('ключ уже есть — файл не трогается, каким бы значение ни было', () => {
    const chosen = 'wake_word:\n  phrase: "эй помощник"\n'

    expect(ensureSectionScalar(chosen, 'wake_word', 'phrase', 'hey pilot')).toEqual({
      text: chosen,
      changed: false,
      unexpectedStructure: false
    })
  })

  it('комментарии и пустые строки внутри секции остаются', () => {
    const yaml = [
      'wake_word:',
      '  # включено вручную',
      '  enabled: true',
      '',
      'model:',
      '  name: x',
      ''
    ].join('\n')

    const result = ensureSectionScalar(yaml, 'wake_word', 'phrase', 'hey pilot')

    expect(result.text).toContain('  # включено вручную')
    expect(result.text).toContain('\n\nmodel:')
  })

  it('секция-скаляр — файл оставляется как есть', () => {
    expect(
      ensureSectionScalar('wake_word: off\n', 'wake_word', 'phrase', 'hey pilot')
    ).toMatchObject({ changed: false, unexpectedStructure: true })
  })

  it('повторный вызов ничего не меняет', () => {
    const once = ensureSectionScalar('model:\n  name: x\n', 'wake_word', 'phrase', 'hey pilot')
    const twice = ensureSectionScalar(once.text, 'wake_word', 'phrase', 'hey pilot')

    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once.text)
  })

  it('значение с кавычками не разваливает файл', () => {
    const result = ensureSectionScalar('', 'wake_word', 'phrase', 'скажи "пилот"')
    expect(result.text).toContain(String.raw`phrase: "скажи \"пилот\""`)
  })

  // Задача 3.B1д. Число обязано лечь числом: ядро стерпело бы и `"3600"`
  // (`float(value)`), но этот файл читает человек, и число в кавычках он
  // прочитает как чужую ошибку — и «поправит».
  it('число пишется без кавычек, строка — в кавычках', () => {
    expect(ensureSectionScalar('', 'agent', 'run_budget_seconds', 3600).text).toContain(
      'run_budget_seconds: 3600'
    )
    expect(ensureSectionScalar('', 'agent', 'note', '3600').text).toContain('note: "3600"')
  })
})
