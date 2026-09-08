// Задача 3E.25. Правила слежения — тестом, а не чтением обработчика.
//
// Главная проверка здесь одна: путь, которого главный процесс человеку не
// показывал, следить НЕЛЬЗЯ. Наблюдатель это возможность: окно называет путь, а
// процесс начинает читать с диска факты о нём.

import { describe, expect, it } from 'vitest'

import { decideWatch, realPathAllowed, sameFile, WATCH_OUTSIDE_ERROR } from './preview-watch-pure'

const PROJECT = process.platform === 'win32' ? 'D:\\проект' : '/проект'
const INSIDE = process.platform === 'win32' ? 'D:\\проект\\отчёт.html' : '/проект/отчёт.html'
const OUTSIDE = process.platform === 'win32' ? 'D:\\чужое\\секрет.html' : '/чужое/секрет.html'

const nothingPicked = (): boolean => false
const everythingPicked = (): boolean => true

describe('decideWatch', () => {
  it('файл внутри проекта — можно', () => {
    expect(decideWatch(PROJECT, INSIDE, nothingPicked)).toEqual({ ok: true, absPath: INSIDE })
  })

  it('относительный путь считается от проекта: его рабочая папка и есть проект', () => {
    expect(decideWatch(PROJECT, './отчёт.html', nothingPicked)).toEqual({
      ok: true,
      absPath: INSIDE
    })
  })

  it('file:// приводится к пути — их панель называет цель именно так', () => {
    const url =
      process.platform === 'win32' ? 'file:///D:/проект/отчёт.html' : 'file:///проект/отчёт.html'

    expect(decideWatch(PROJECT, url, nothingPicked)).toEqual({ ok: true, absPath: INSIDE })
  })

  it('файл ВНЕ проекта — нельзя, и это главное правило задачи', () => {
    expect(decideWatch(PROJECT, OUTSIDE, nothingPicked)).toEqual({
      ok: false,
      error: WATCH_OUTSIDE_ERROR
    })
  })

  it('тот же файл ВНЕ проекта — можно, если человек выбрал его в нашем диалоге', () => {
    // Правило то же, что у вложений (3.13b): главный процесс сам его показал.
    expect(decideWatch(PROJECT, OUTSIDE, everythingPicked)).toEqual({ ok: true, absPath: OUTSIDE })
  })

  it('выход из проекта точками не проходит', () => {
    const escape = decideWatch(PROJECT, '../чужое/секрет.html', nothingPicked)

    expect(escape.ok).toBe(false)
  })

  it('адрес — не файл, и следить за ним нечем', () => {
    expect(decideWatch(PROJECT, 'https://example.com/x.html', nothingPicked).ok).toBe(false)
  })

  it('без открытого проекта относительный путь не разрешается', () => {
    expect(decideWatch(undefined, './отчёт.html', nothingPicked).ok).toBe(false)
  })
})

describe('realPathAllowed', () => {
  it('ссылка внутри проекта, ведущая наружу, не проходит', () => {
    // Лексическая проверка её пропускает — потому и существует второй слой.
    expect(realPathAllowed(PROJECT, OUTSIDE, nothingPicked)).toBe(false)
    expect(realPathAllowed(PROJECT, INSIDE, nothingPicked)).toBe(true)
  })
})

describe('sameFile', () => {
  it('событие соседнего файла в той же папке отбрасывается', () => {
    expect(sameFile('отчёт.html', 'смета.html')).toBe(false)
    expect(sameFile('отчёт.html', 'отчёт.html')).toBe(true)
  })

  it('событие без имени считается нашим: ложная перерисовка дешевле пропущенной', () => {
    expect(sameFile('отчёт.html', null)).toBe(true)
  })

  it.runIf(process.platform === 'win32')('на Windows регистр имени не значим', () => {
    expect(sameFile('Отчёт.HTML', 'отчёт.html')).toBe(true)
  })
})
