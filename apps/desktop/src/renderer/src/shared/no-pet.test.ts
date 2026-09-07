// Питомца в специалисте нет (SPEC HX1) — задача 3C.3, сужено задачей 3E.6.
//
// ЧТО ИЗМЕНИЛОСЬ 2026-09-07. Файл назывался `no-portrait-generation.test.ts` и
// сторожил ДВА запрета сразу: питомца (HX1) и портрет генерацией (HX11).
// Второй отменён решением владельца 05.09.2026 — HX11 сужен, генерация
// картинок и `image.generate` вошли в объём (UR33), а вместе с ними вернулся и
// портрет: это прямо названо ценой сужения в SPEC и составляет содержание
// задачи 3E.1. Гвард на отменённое правило хуже отсутствующего: он запрещает
// то, что разрешено, и объясняет это ссылкой, которой больше нет.
//
// ПОЧЕМУ ФАЙЛ НЕ УДАЛЁН ЦЕЛИКОМ, хотя verify задачи 3E.6 говорит «удалён».
// Он сторожил два правила, а отменено одно. Удаление вместе с HX1 сняло бы
// охрану с запрета, который в силе, — тот же случай, что в 3D.6, когда этот же
// файл едва не уехал вместе с папкой роестра. Задача просила не оставлять
// красный тест; красным он и не остаётся — он сузился до того, что охраняет.
//
// ПОЧЕМУ ЭТО ТЕСТ, А НЕ ОБЕЩАНИЕ В ДОКУМЕНТЕ. Запрет живёт в коде как
// ОТСУТСТВИЕ: нет кнопки — нет и вызова. Отсутствие не защищено ничем, кроме
// внимания, а добавить питомца — это одна строка, которая выглядит как
// улучшение. Тест делает границу видимой в тот момент, когда её переходят.
//
// ЗАВИСИМОСТЬ `blobatar` СТОРОЖИТСЯ ЗДЕСЬ С 2026-09-07 (задача 3E.12). Она
// приезжала вместе с питомцем, и до сих пор её сторожил `no-agent-ui-control.
// test.ts` — файл, стоявший на HX16/HX17. Оба исключения отменены, файл удалён,
// а этот запрет остался в силе: ему место у своего правила, а не у чужого.
// Ловится ИМПОРТ, а не имя (уточнено задачей 3D.2): их плагин специалистов
// зовёт `blobatarSvg` в семи местах, и все семь заперты проверкой на
// `undefined` — пакета нет, наш SDK его не реэкспортирует. Запрещена
// ЗАВИСИМОСТЬ, а не слово.
//
// ГРАНИЦА ПРОВЕДЕНА ТОЧНО. Проверяется НАШ код (`aec/**`, `main/**`).
// Перенесённый код донора живёт по своим правилам: их `pet.tsx` не
// зарегистрирован (правка [3]), и это проверяется не здесь, а составом зоны.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const OUR_ROOTS = [join(__dirname, '..', 'aec'), join(__dirname, '../../../main')]

/** Питомец в любом написании. Генерация картинки отсюда УБРАНА вместе с HX11. */
const FORBIDDEN = /\bpet\b|питом/i

/** Комментарии выбрасываются перед проверкой. Запрет наложен на ВЫЗОВ, а не на
 * упоминание: наши файлы объясняют границу словами, и без очистки тест ловил бы
 * объяснение запрета как его нарушение. */
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

describe('питомца нет (HX1)', () => {
  it('в нашем коде нет питомца', () => {
    const offenders = OUR_ROOTS.flatMap(sourcesUnder).filter((file) =>
      FORBIDDEN.test(code(readFileSync(file, 'utf-8')))
    )

    expect(
      offenders,
      'лицо специалиста — форма и цвет, загруженная картинка либо портрет по UR33; питомца среди вариантов нет'
    ).toEqual([])
  })

  it('лица питомца не приехали в зависимости', () => {
    const manifest = JSON.parse(
      readFileSync(join(__dirname, '../../../..', 'package.json'), 'utf-8')
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const installed = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

    expect(installed.filter((name) => name === 'blobatar')).toEqual([])
  })

  it('импорта blobatar нет ни в одном файле приложения', () => {
    // Их мёртвый откат в перенесённых файлах не ловится: там переменная,
    // запертая проверкой. Настоящий возврат — это строка `from 'blobatar/…'`.
    const RETURN = /from\s+['"]blobatar|require\(['"]blobatar/
    const offenders = OUR_ROOTS.flatMap(sourcesUnder).filter((file) =>
      RETURN.test(readFileSync(file, 'utf-8'))
    )

    expect(offenders).toEqual([])
  })
})
