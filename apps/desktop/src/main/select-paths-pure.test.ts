import { describe, expect, it } from 'vitest'

import { planSelectPaths } from './select-paths-pure'

// Задача 3.17. Проверяется не «не упало», а «диалог открывается тот». Перепутанные
// `openFile`/`openDirectory` не роняют ничего: человек нажимает «Папка», видит
// выбор файлов и решает, что сломан продукт.

describe('planSelectPaths', () => {
  it('без запроса открывает выбор файлов с множественным выбором', () => {
    expect(planSelectPaths(undefined).properties).toEqual(['openFile', 'multiSelections'])
  })

  it('directories открывает выбор ПАПОК', () => {
    expect(planSelectPaths({ directories: true }).properties).toEqual([
      'openDirectory',
      'multiSelections'
    ])
  })

  it('multiple: false снимает множественный выбор', () => {
    expect(planSelectPaths({ multiple: false }).properties).toEqual(['openFile'])
  })

  it('заголовок и начальный путь передаются, пустые — нет', () => {
    const plan = planSelectPaths({ title: 'Добавить файлы', defaultPath: 'D:\\проект' })
    expect(plan.title).toBe('Добавить файлы')
    expect(plan.defaultPath).toBe('D:\\проект')

    const empty = planSelectPaths({ title: '', defaultPath: '' })
    expect(empty.title).toBeUndefined()
    expect(empty.defaultPath).toBeUndefined()
  })

  it('фильтры расширений проходят к выбору файлов', () => {
    const plan = planSelectPaths({ filters: [{ name: 'Чертежи', extensions: ['dwg', 'pdf'] }] })
    expect(plan.filters).toEqual([{ name: 'Чертежи', extensions: ['dwg', 'pdf'] }])
  })

  it('к выбору ПАПКИ фильтры не применяются — иначе папок «нет»', () => {
    const plan = planSelectPaths({
      directories: true,
      filters: [{ name: 'Чертежи', extensions: ['dwg'] }]
    })
    expect(plan.filters).toBeUndefined()
  })

  it('мусор из рендерера отбрасывается, а не уезжает в диалог', () => {
    const plan = planSelectPaths({
      title: 42,
      defaultPath: { path: 'D:\\' },
      filters: [
        { name: '', extensions: ['dwg'] },
        { name: 'Пусто', extensions: [] },
        'строка',
        null
      ]
    } as never)
    expect(plan.title).toBeUndefined()
    expect(plan.defaultPath).toBeUndefined()
    expect(plan.filters).toBeUndefined()
    expect(plan.properties).toEqual(['openFile', 'multiSelections'])
  })
})
