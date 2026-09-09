// Задача 3E.31. Правила записи — тестом, а не чтением обработчика.
//
// Главная проверка та же, что у слежения, и она здесь важнее: по пути, которого
// главный процесс человеку не показывал, писать НЕЛЬЗЯ. Разница в цене ошибки —
// слежение отдаёт факты о чужом файле, запись его меняет.

import { describe, expect, it } from 'vitest'

import { decideWrite, realPathWritable, WRITE_OUTSIDE_ERROR } from './preview-write-pure'

const PROJECT = process.platform === 'win32' ? 'D:\\проект' : '/проект'
const INSIDE = process.platform === 'win32' ? 'D:\\проект\\заметка.md' : '/проект/заметка.md'
const OUTSIDE = process.platform === 'win32' ? 'D:\\чужое\\секрет.md' : '/чужое/секрет.md'

const nothingPicked = (): boolean => false
const everythingPicked = (): boolean => true

describe('decideWrite', () => {
  it('файл внутри проекта — можно', () => {
    expect(decideWrite(PROJECT, INSIDE, nothingPicked)).toEqual({ ok: true, absPath: INSIDE })
  })

  it('файл ВНЕ проекта — нельзя, и это главное правило задачи', () => {
    expect(decideWrite(PROJECT, OUTSIDE, nothingPicked)).toEqual({
      ok: false,
      error: WRITE_OUTSIDE_ERROR
    })
  })

  it('тот же файл ВНЕ проекта — можно, если человек выбрал его в нашем диалоге', () => {
    expect(decideWrite(PROJECT, OUTSIDE, everythingPicked)).toEqual({ ok: true, absPath: OUTSIDE })
  })

  it('выход из проекта точками не проходит', () => {
    expect(decideWrite(PROJECT, '../чужое/секрет.md', nothingPicked).ok).toBe(false)
  })

  it('относительный путь считается от проекта', () => {
    expect(decideWrite(PROJECT, './заметка.md', nothingPicked)).toEqual({
      ok: true,
      absPath: INSIDE
    })
  })

  it('без открытого проекта относительный путь не разрешается', () => {
    expect(decideWrite(undefined, './заметка.md', nothingPicked).ok).toBe(false)
  })

  it('пустой путь — отказ, а не запись в рабочую папку', () => {
    expect(decideWrite(PROJECT, '', nothingPicked).ok).toBe(false)
  })

  it('отказ говорит про СОХРАНЕНИЕ: их редактор показывает этот текст человеку', () => {
    // Текст слежения в ответ на «сохранить» соврал бы о том, что произошло.
    expect(WRITE_OUTSIDE_ERROR).toContain('Сохранять')
  })
})

describe('realPathWritable', () => {
  it('настоящий путь внутри проекта — можно', () => {
    expect(realPathWritable(PROJECT, INSIDE, nothingPicked)).toBe(true)
  })

  it('ссылка, ведущая наружу, — нельзя: лексическая проверка её пропустила бы', () => {
    expect(realPathWritable(PROJECT, OUTSIDE, nothingPicked)).toBe(false)
  })

  it('наружу — можно, если этот файл человек выбрал сам', () => {
    expect(realPathWritable(PROJECT, OUTSIDE, everythingPicked)).toBe(true)
  })
})
