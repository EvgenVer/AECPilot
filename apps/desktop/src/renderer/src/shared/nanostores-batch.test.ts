// `batch` из nanostores не должен быть помечен как «без побочных эффектов» — D-108.
//
// В nanostores 1.4.0 над `export const batch` стояла аннотация
// `/* @__NO_SIDE_EFFECTS__ */`. Rollup ей верит: вызов `batch(() => { … })`,
// результат которого никто не читает, выбрасывается из сборки ВМЕСТЕ с записями
// в атомы внутри. Так из `setWorkspaceScope` донора пропали все три записи —
// режим «Специалисты» не включался никогда, и чат специалиста не открывался
// («Session open was superseded by a newer selection»). В 1.4.2 аннотацию сняли.
//
// Проверяется ИСТОЧНИК, а не сборка: сборку vitest не видит, а откат версии
// (или новая версия с той же аннотацией) — ровно то, что вернёт дефект молча.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('nanostores batch (D-108)', () => {
  it('не помечен @__NO_SIDE_EFFECTS__ — иначе сборщик выбрасывает его вызовы', () => {
    const root = dirname(createRequire(import.meta.url).resolve('nanostores/package.json'))
    const source = readFileSync(join(root, 'atom', 'index.js'), 'utf8')

    expect(source).toMatch(/export const batch\b/)
    expect(source).not.toMatch(/@__NO_SIDE_EFFECTS__\s*\*\/\s*export const batch\b/)
  })
})
