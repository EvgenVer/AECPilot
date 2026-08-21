// Член их моста, объявленный `=> void`, не может достаться заглушке.
//
// ЗАЧЕМ ЭТА ПРОВЕРКА СУЩЕСТВУЕТ. Их код зовёт такие члены в том числе ТЕЛОМ
// эффекта:
//
//     useEffect(() => syncNativeTheme(mode, renderedMode), [mode, renderedMode])
//
// Что вернёт член, то React запомнит как «функцию уборки» этого эффекта. У
// непроброшенного члена заглушка шима возвращает отклонённый промис — и на
// втором срабатывании эффекта React зовёт промис как функцию. Всё дерево
// заменяется их аварийным экраном.
//
// Так и умирало приложение (находка D-42, разобрана 2026-08-21): тема ОС уходила
// в тёмную — первое срабатывание, промис оседал уборкой; возвращалась в светлую
// — второе, и `destroy_ is not a function`. Снаружи это выглядело как «в тёмную
// уходит, обратно не возвращается», и искалось не там.
//
// ЧИТАЮТСЯ ДВА ФАЙЛА, А НЕ МОДУЛЬ. Их контракт — чтобы проверка пережила перенос
// донора: новый `=> void`-член провалит её, а не приложение у человека. Наш шим —
// исходником, а не импортом: он тянет за собой половину рендерера и в узловом
// тесте не поднимается.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const CONTRACT = join(__dirname, '..', 'donor', 'global.d.ts')
const SHIM = join(__dirname, 'hermes-desktop-shim.ts')

/** Тело блока `hermesDesktop: { … }` из их файла типов. */
function bridgeBlock(source: string): string {
  const start = source.indexOf('{', source.indexOf('hermesDesktop: {'))
  let depth = 0

  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index)
    }
  }

  throw new Error('не нашёлся блок hermesDesktop в donor/global.d.ts')
}

/** Однострочные члены вида `name?: (…) => void` на верхнем уровне блока. */
const VOID_MEMBER = /^ {6}([A-Za-z_$][\w$]*)\??:\s*\((?:[^()]|\([^()]*\))*\)\s*=>\s*void\s*$/gm

/** Заявлен ли член в `IMPLEMENTED` — как метод, как значение или как
 * `undefined`. Ключи там стоят на двух пробелах отступа. */
function declaredInShim(shim: string, name: string): boolean {
  return new RegExp(`^ {2}${name}\\s*[(:]`, 'm').test(shim)
}

describe('члены их моста, объявленные `=> void` (находка D-42)', () => {
  const names = [...bridgeBlock(readFileSync(CONTRACT, 'utf-8')).matchAll(VOID_MEMBER)]
    .map((match) => match[1])
    .sort()

  it('их вообще нашлось сколько-то — иначе проверка пустая', () => {
    expect(names.length).toBeGreaterThan(3)
  })

  it('о каждом шим ЗАЯВИЛ: либо реализовал, либо объявил отсутствующим', () => {
    const shim = readFileSync(SHIM, 'utf-8')
    const abandoned = names.filter((name) => !declaredInShim(shim, name))

    expect(
      abandoned,
      'такой член достанется заглушке, а она возвращает промис — см. шапку файла'
    ).toEqual([])
  })
})
