// Третий вход установки (SPEC UR23) закрыт по построению — задача 3.8.
//
// У UR23 три входа: человек в интерфейсе, инструмент агента `setup_mcp` и
// ВНЕШНЯЯ ССЫЛКА. Для третьего требование строже остальных: источник ссылки
// виден до подтверждения, и ни один шаг установки не выполняется раньше —
// «иначе это канал „чужой текст ставит серверный процесс“».
//
// В нашей сборке этот канал не гейтится, а ОТСУТСТВУЕТ: приложение не
// регистрирует в операционной системе ни одной схемы, поэтому `hermes://…`
// никуда не приходит. Их подписка на такие ссылки объявлена отсутствующей в
// шиме, и без регистрации схемы ей нечего получать.
//
// Проверка читает исходник главного процесса. Она сторожит именно тот момент,
// когда канал мог бы открыться незаметно: чтобы вызвать `setAsDefaultProtocolClient`,
// достаточно одной строки — и её появление обязано быть решением, а не правкой
// «заодно». Если такая строка понадобится (обновления, вход по ссылке), тест
// падает и напоминает: сначала гейт доверия, потом схема.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const MAIN_DIR = __dirname

/** Как открывается канал внешних ссылок в Electron: приложение объявляет себя
 * ОПЕРАЦИОННОЙ СИСТЕМЕ обработчиком схемы, и после этого `hermes://…`, нажатый
 * в почте или в браузере, приходит сюда. Это и есть третий вход. */
const OS_PROTOCOL_REGISTRATION = /setAsDefaultProtocolClient/

/** Схемы, которые приложение обслуживает ВНУТРИ СЕБЯ. Это не третий вход: такой
 * обработчик виден только нашим же страницам, снаружи по нему не постучаться, и
 * система о схеме не знает вовсе. Список закрытый — новая схема здесь роняет
 * тест, и это правильно: заводить её нужно решением, а не правкой «заодно». */
const IN_APP_SCHEMES = new Set(['hermes-media'])

const IN_APP_HANDLER = /protocol\.(?:registerSchemesAsPrivileged|handle)\b/
const SCHEME_LITERAL = /MEDIA_SCHEME = '([a-z-]+)'/

function mainSources(): string[] {
  return readdirSync(MAIN_DIR)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => join(MAIN_DIR, name))
}

describe('канал внешних ссылок закрыт (SPEC UR23, третий вход)', () => {
  it('главный процесс не объявляет себя системе обработчиком ни одной схемы', () => {
    const offenders = mainSources().filter((file) =>
      OS_PROTOCOL_REGISTRATION.test(readFileSync(file, 'utf-8'))
    )

    expect(
      offenders.map((file) => file.slice(MAIN_DIR.length + 1)),
      'схема в системе — это вход установки снаружи; сначала гейт доверия (UR23)'
    ).toEqual([])
  })

  // Внутренняя схема появилась в задаче 3.13b: проигрывателю нужен источник с
  // перемоткой, а прямой адрес ядра нести нельзя — он с токеном (SPEC C9).
  // Снаружи по ней не постучаться, но список всё равно закрытый.
  it('внутренние схемы — только из закрытого списка', () => {
    const handlers = mainSources().filter((file) =>
      IN_APP_HANDLER.test(readFileSync(file, 'utf-8'))
    )

    expect(handlers.length, 'обработчик схемы должен быть ровно один — media-proxy').toBe(1)

    for (const file of handlers) {
      const declared = SCHEME_LITERAL.exec(readFileSync(file, 'utf-8'))?.[1]

      expect(
        declared !== undefined && IN_APP_SCHEMES.has(declared),
        `${file.slice(MAIN_DIR.length + 1)}: новая схема — это решение, а не правка «заодно»`
      ).toBe(true)
    }
  })
})
