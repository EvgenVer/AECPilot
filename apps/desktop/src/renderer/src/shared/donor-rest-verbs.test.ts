// Мост обязан пропускать те HTTP-глаголы, которыми донор реально ходит (3.16).
//
// НАЙДЕНО ЗАДАЧЕЙ 3.16, 2026-08-31. Донор шлёт `PATCH` на шесть маршрутов —
// архив сессии, закрепление, отметка прочитанного, переименование профиля и два
// вызова их SDK, — а обе наши проверки метода знали только GET/POST/PUT/DELETE.
// Каждый такой вызов отклонялся ещё в рендерере строкой «unsupported method
// PATCH»: кнопка «в архив» в меню фильтра НИЧЕГО не делала.
//
// Это тот же класс, что D-41, но с другой стороны моста: там непроброшенным был
// ЧЛЕН, здесь — ГЛАГОЛ. Сборка молчит одинаково в обоих случаях, и прослеживание
// по дереву («код на месте и связан») тоже: код был на месте и был связан.
//
// ПОЧЕМУ ГЕЙТ, А НЕ ПРОСТО ПРАВКА. Список глаголов у донора меняется при
// переносе, а обе наши проверки — рукописные. Тест читает их дерево ИСХОДНИКОМ
// и падает на глаголе, которого ни один из двух списков не знает.
//
// ГРАНИЦА ЧТЕНИЯ. Ищутся только ЗАГЛАВНЫЕ литералы `method: 'XXX'`: имена
// JSON-RPC у них точечные и строчные (`session.create`), поэтому заглавный
// литерал в их дереве — всегда HTTP-глагол. Если однажды окажется не всегда,
// тест упадёт и решение примет человек. Для гейта это правильная сторона ошибки.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const DONOR_DIR = join(__dirname, '..', 'donor')
const SHIM = join(__dirname, 'hermes-desktop-shim.ts')
const PASSTHROUGH = join(__dirname, '..', '..', '..', 'main', 'gateway-passthrough-pure.ts')

/** Глагол, которым донор никогда не ходит и который мост принимать не обязан.
 * Пусто — все, что он пишет, мы пропускаем. Запись сюда означала бы решение
 * «этот глагол мы намеренно не поддерживаем», и его пришлось бы обосновать. */
const DELIBERATELY_UNSUPPORTED: readonly string[] = []

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** Глаголы, которые пишет код донора, и кто именно их пишет. Второе нужно,
 * чтобы при падении не гадать, какой экран сломается. */
function verbsCalledByDonor(): Map<string, string[]> {
  const found = new Map<string, string[]>()

  for (const file of walk(DONOR_DIR)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/method:\s*'([A-Z]+)'/g)) {
      const verb = match[1]
      const callers = found.get(verb) ?? []
      const short = file.slice(DONOR_DIR.length + 1).replace(/\\/g, '/')
      if (!callers.includes(short)) callers.push(short)
      found.set(verb, callers)
    }
  }

  return found
}

/** Разрешённые глаголы, вычитанные из ИСХОДНИКА проверки, а не импортированные:
 * оба списка приватны своим модулям, и делать их публичными ради теста значило
 * бы расширить контракт под проверку. */
function allowedVerbs(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const line = source.match(/const REST_METHODS = \[([^\]]*)\]/)

  if (!line) throw new Error(`не нашёл REST_METHODS в ${file}`)

  return [...line[1].matchAll(/'([A-Z]+)'/g)].map((match) => match[1])
}

describe('глаголы REST: мост пропускает то, чем донор ходит', () => {
  const donorVerbs = verbsCalledByDonor()

  it('донор вообще ходит по REST — иначе тест ничего не проверяет', () => {
    // Страховка от тихого нуля: если разбор их дерева однажды перестанет что-то
    // находить, остальные проверки станут зелёными, не проверив ничего.
    expect(donorVerbs.size).toBeGreaterThan(1)
  })

  for (const gate of [
    { file: SHIM, name: 'шим рендерера' },
    { file: PASSTHROUGH, name: 'проброс в главном процессе' }
  ]) {
    it(`${gate.name} знает каждый глагол донора`, () => {
      const allowed = allowedVerbs(gate.file)
      const missing = [...donorVerbs.entries()]
        .filter(([verb]) => !allowed.includes(verb))
        .filter(([verb]) => !DELIBERATELY_UNSUPPORTED.includes(verb))
        .map(([verb, callers]) => `${verb} ← ${callers.join(', ')}`)

      expect(missing, 'глагол отклоняется мостом — вызов молча не сработает').toEqual([])
    })
  }

  it('оба списка совпадают между собой', () => {
    // Расхождение — это дыра, которую видно только в бою: рендерер пропустит
    // вызов, а главный процесс отобьёт его (или наоборот), и отказ придёт не
    // оттуда, где его ищут.
    expect([...allowedVerbs(SHIM)].sort()).toEqual([...allowedVerbs(PASSTHROUGH)].sort())
  })
})
