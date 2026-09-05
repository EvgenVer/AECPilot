// Агент не водит человека по интерфейсу (SPEC HX16) и не нажимает внутри
// предпросмотра (SPEC HX17) — задача 3.B1б.
//
// ПОЧЕМУ ЭТО ТЕСТ, А НЕ ЗАПИСЬ В ДОКУМЕНТЕ. Обе возможности приехали в ядре
// 0.20.5 готовыми, вместе со своими методами и своей половиной в коде донора.
// Мы их не берём, и это решение живёт в коде как ОТСУТСТВИЕ: снята ветка
// обработчика, снят импорт движка. Отсутствие не защищено ничем — при следующем
// переносе донора файл приедет заново со всеми ветками, и вернуть их будет не
// «изменением», а бездействием. Тест делает границу видимой ровно в тот момент,
// когда её переходят, — и переживает перенос, потому что живёт вне зоны донора.
//
// ЧТО ИМЕННО ЗАПРЕЩЕНО. Два метода шлюза и два их модуля:
//   `tour.respond`         + `lib/tour`         — подсветить элемент и рассказать
//   `preview.act.respond`  + `lib/preview-act`  — нажать/ввести внутри страницы
// Плюс две зависимости, которые приезжают только вместе с ними: `driver.js`
// (движок обхода) и `blobatar` (лица питомца, HX1).
//
// ЧТО НЕ ЗАПРЕЩЕНО И ПОЧЕМУ ГРАНИЦА ЗДЕСЬ. `read_preview` — чтение текста
// открытой вкладки — остаётся взятым (UR22): без него агент не видит того, что
// сам построил. Разница между «прочитать свой артефакт» и «нажать в нём» и есть
// вся HX17.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const APP_ROOT = join(__dirname, '..', '..', '..', '..')
const RENDERER = join(APP_ROOT, 'src', 'renderer', 'src')
const MAIN = join(APP_ROOT, 'src', 'main')

/** Вызовы и импорты, которых в дереве быть не должно. Именно вызовы: имя метода
 * встречается ещё и в объяснениях, и они проверку проходить обязаны. */
// `blobatar` ловится ИМПОРТОМ, а не именем (уточнено задачей 3D.2). Их плагин
// специалистов зовёт переменную `blobatarSvg` в семи местах, и все семь заперты
// проверкой `if (!blobatarSvg)`: пакета нет, наш SDK его не реэкспортирует, и
// значение везде `undefined`. Запрещена ЗАВИСИМОСТЬ, а не слово: широкий шаблон
// ловил бы их мёртвый откат и заставлял бы править чужие файлы ради проверки.
// Настоящий возврат — это строка `from 'blobatar/...'`, и она ловится по-прежнему.
const FORBIDDEN =
  /tour\.respond|preview\.act\.respond|@\/lib\/tour|@\/lib\/preview-act|['"]driver\.js['"]|from\s+['"]blobatar|require\(['"]blobatar/

/** Комментарии выбрасываются перед проверкой — этот файл и заголовки правок в
 * зоне донора объясняют запрет словами, и без очистки тест ловил бы объяснение
 * запрета как его нарушение. */
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

describe('агент не управляет интерфейсом (SPEC HX16, HX17)', () => {
  it('ни один файл приложения не зовёт обход интерфейса и нажатие в предпросмотре', () => {
    const offenders: string[] = []

    for (const file of [...sourcesUnder(RENDERER), ...sourcesUnder(MAIN)]) {
      const stripped = code(readFileSync(file, 'utf-8'))
      if (FORBIDDEN.test(stripped)) offenders.push(file.slice(APP_ROOT.length + 1))
    }

    expect(offenders).toEqual([])
  })

  it('движок обхода и лица питомца не приехали в зависимости', () => {
    const manifest = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const installed = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })

    expect(installed.filter((name) => name === 'driver.js' || name === 'blobatar')).toEqual([])
  })
})
