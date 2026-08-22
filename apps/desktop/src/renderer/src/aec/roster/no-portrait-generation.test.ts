// Лицо специалиста не рисует модель (SPEC HX11) и питомца в нём нет (SPEC HX1) —
// задача 3C.3.
//
// ПОЧЕМУ ЭТО ТЕСТ, А НЕ ОБЕЩАНИЕ В ДОКУМЕНТЕ. Оба запрета живут в коде как
// ОТСУТСТВИЕ: нет кнопки — нет и вызова. Отсутствие не защищено ничем, кроме
// внимания, а добавить «сгенерировать лицо» — это одна строка, которая выглядит
// как улучшение. Тест делает границу видимой в тот момент, когда её переходят.
//
// ГРАНИЦА ПРОВЕДЕНА ТОЧНО. Инструмент агента `image_generate` — это когда
// ЧЕЛОВЕК просит агента нарисовать картинку, и её показ живёт в перенесённом
// коде донора (`donor/components/assistant-ui/**`). Это не портрет специалиста и
// под HX11 не подпадает. Поэтому проверяется НАШ код: роестр и всё, что мы
// написали сами.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const OUR_ROOTS = [join(__dirname, '..'), join(__dirname, '../../../../main')]

/** Что ищем: вызов генерации картинки и питомец в любом написании. */
const FORBIDDEN = /image[._]generate|\bpet\b|питом/i

/** Комментарии выбрасываются перед проверкой. Запрет наложен на ВЫЗОВ, а не на
 * упоминание: этот же файл и файлы роестра объясняют границу словами, и без
 * очистки тест ловил бы объяснение запрета как его нарушение. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ')
}

function sourcesUnder(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourcesUnder(path))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path)
  }

  return found
}

describe('портрет не генерируется, питомца нет (HX1, HX11)', () => {
  it('в нашем коде нет ни вызова генерации, ни питомца', () => {
    const offenders = OUR_ROOTS.flatMap(sourcesUnder).filter((file) =>
      FORBIDDEN.test(code(readFileSync(file, 'utf-8')))
    )

    expect(
      offenders,
      'лицо специалиста — форма и цвет либо загруженная картинка; модель его не рисует'
    ).toEqual([])
  })
})
