// Задача 3L.5: что прислало окно для «Индексировать» / «Убрать из индекса» и
// когда это нельзя сделать.

import { describe, expect, it } from 'vitest'

import { decideIndexTarget, includePlan } from './index-actions-pure'

const IDLE = { graph: false, ingest: false }

describe('decideIndexTarget (3L.5)', () => {
  it('файл источника — место `<source>/<rel>`, не проект', () => {
    expect(
      decideIndexTarget({ kind: 'file', rel: 'КР/Сваи.pdf', sourceId: 's1' }, ['s1'], IDLE)
    ).toEqual({
      ok: true,
      place: 's1/КР/Сваи.pdf',
      project: false,
      rel: 'КР/Сваи.pdf'
    })
  })

  it('файл проекта — путь в vault, убирает и возвращает его отметка', () => {
    expect(
      decideIndexTarget({ kind: 'file', rel: 'wiki/КР.md', sourceId: 'project' }, [], IDLE)
    ).toMatchObject({ ok: true, place: 'project/wiki/КР.md', project: true, rel: 'wiki/КР.md' })
  })

  it('чужой источник, `..` и источник целиком — отказ словами', () => {
    expect(decideIndexTarget({ kind: 'file', rel: 'a', sourceId: 'x' }, ['s1'], IDLE).ok).toBe(
      false
    )
    expect(decideIndexTarget({ kind: 'file', rel: '../a', sourceId: 's1' }, ['s1'], IDLE).ok).toBe(
      false
    )
    expect(decideIndexTarget({ kind: 'folder', rel: '', sourceId: 's1' }, ['s1'], IDLE)).toEqual({
      error: 'Выберите файл или папку',
      ok: false
    })
  })

  it('во время прогона индекса или графа — отказ, ничего не делается', () => {
    const payload = { kind: 'file', rel: 'a.pdf', sourceId: 's1' }
    expect(decideIndexTarget(payload, ['s1'], { graph: false, ingest: true })).toEqual({
      error: 'Идёт индексация — дождитесь её конца',
      ok: false
    })
    expect(decideIndexTarget(payload, ['s1'], { graph: true, ingest: false })).toEqual({
      error: 'Строится граф — дождитесь его конца',
      ok: false
    })
  })
})

describe('includePlan (3L.5)', () => {
  it('убранный файл или папка с убранным внутри — снять отметку', () => {
    expect(includePlan('s1/КР/Сваи.pdf', ['s1/КР/Сваи.pdf'])).toEqual({ include: true, ok: true })
    expect(includePlan('s1/КР', ['s1/КР/Сваи.pdf'])).toEqual({ include: true, ok: true })
  })

  it('не убранный — просто индексировать', () => {
    expect(includePlan('s1/КР-2/Плиты.pdf', ['s1/КР'])).toEqual({ include: false, ok: true })
  })

  it('файл внутри убранной папки — отказ с именем папки', () => {
    expect(includePlan('s1/КР/Сваи.pdf', ['s1/КР'])).toEqual({
      error: 'Папка «КР» убрана из индекса — верните её целиком',
      ok: false
    })
  })
})
