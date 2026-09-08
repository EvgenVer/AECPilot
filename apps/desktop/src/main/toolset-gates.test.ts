// Задачи 3E.19 и 3E.20: какие наборы ядра мы открываем модели, а какие закрываем.
//
// ЧИТАЕТСЯ ИСХОДНИК, а не вызывается функция, и причина та же, что у
// `donor-members.test.ts`: `main/index.ts` тянет за собой Electron и в узловом
// тесте не поднимается. Проверяется то единственное, что может сломаться
// молча, — СОСТАВ списков, которые мы пишем в чужой конфиг.
//
// Почему это вообще тест, а не комментарий. Ключ `platform_toolsets` задаёт
// СПИСОК РАЗРЕШЁННОГО: однажды он обрезал нашего агента с 19 наборов до 8
// (замечание D-66), потому что в списке не было их составного набора. Замер
// 2026-09-08 показал, что с `hermes-cli` рядом состав не сужается (53 → 54
// предложенных инструмента, ни один не пропал). Пропажа `hermes-cli` из этой
// строки вернула бы D-66 — и заметить это можно только живым прогоном ядра,
// которого в наборе тестов нет.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const MAIN = readFileSync(join(__dirname, 'index.ts'), 'utf-8')

/** Значения списка, который пишет один конкретный вызов `ensure*List`: всё, что
 * стоит в кавычках ПОСЛЕ названия ключа и до закрывающей скобки. */
function listFor(callPrefix: string): string[] {
  const match = new RegExp(`${callPrefix}([^)]*)\\)`, 's').exec(MAIN)
  if (!match) throw new Error(`в index.ts нет вызова ${callPrefix}`)
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('наборы, открытые модели', () => {
  it('видео включается через platform_toolsets, и их составной набор остаётся рядом', () => {
    const args = listFor("ensureSectionList\\(original, 'platform_toolsets', 'cli'")

    expect(args).toContain('video')
    // Вот эта строка и есть защита от D-66.
    expect(args).toContain('hermes-cli')
  })

  it('доска открывается ключом toolsets — он к инструментам модели не относится', () => {
    // Замерено 3E.19: добавление набора в `toolsets` не изменило ни одного
    // предложенного инструмента. Ключ читает только шлюз доски, и запись здесь
    // держит это разделение видимым.
    const args = listFor("ensureTopLevelList\\(original, 'toolsets'")

    expect(args).toContain('kanban')
    expect(args).toContain('hermes-cli')
    expect(args).not.toContain('video')
  })
})

describe('наборы, закрытые для модели', () => {
  it('вычитаются и голос, и проекты ядра', () => {
    const args = listFor("ensureSectionList\\(original, 'agent', 'disabled_toolsets'")

    // SPEC HX19 — ответ агента вслух (замечание D-67).
    expect(args).toContain('tts')
    // SPEC HX23 — проект переключает человек, а не агент (граница R7).
    expect(args).toContain('project')
  })

  it('генерация видео НЕ попадает в разрешённые вместе с пониманием видео', () => {
    // SPEC HX11 исключает `video_gen` поимённо, и наборы у ядра разные
    // (`video` против `video_gen`) — перепутать их означало бы открыть
    // исключённое одной буквой.
    expect(MAIN).not.toContain("'video_gen'")
  })
})
