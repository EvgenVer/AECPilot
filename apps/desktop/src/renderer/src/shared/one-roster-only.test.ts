// Ровно один роестр в окне — правило фазы 3D (задача 3D.3).
//
// ЗАЧЕМ ЭТОТ ГВАРД СУЩЕСТВУЕТ. Правило «одновременно зарегистрированных
// роестров не существует ни одного коммита» было записано в TASKS как правило
// фазы — и НАРУШИЛОСЬ незамеченным на два коммита. Причина в том, что вторая
// регистрация появилась не строчкой кода, а САМА: их `discoverBundledPlugins()`
// ищет плагины вызовом `import.meta.glob('../plugins/*/plugin.{js,ts,tsx}')`,
// и как только файл плагина лёг в зону, он немедленно стал зарегистрированным.
// Ни одного места, где это было бы написано, в нашем коде нет.
//
// Правило, которое нельзя проверить чтением диффа, обязано проверяться
// машиной — иначе оно не правило, а пожелание.
//
// ПОЧЕМУ СЧИТАЕТСЯ ПО ИСХОДНИКАМ, А НЕ ПРОГОНОМ РЕЕСТРА. Поднять их реестр
// в тесте значит поднять оболочку целиком: `contrib/controller.tsx` тянет
// приложение. Здесь важно не «что лежит в реестре сейчас», а «может ли вторая
// поверхность попасть туда при следующей сборке», и это видно по исходникам.
// Живой прогон окна закрывает e2e (`donor-shell-smoke`), а не unit-тест.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RENDERER_SRC = path.resolve(HERE, '..')
const DONOR_PLUGINS = path.join(RENDERER_SRC, 'donor', 'plugins')

/** Их glob из `donor/contrib/plugins.ts`: каждая папка с `plugin.{js,ts,tsx}`,
 * default-экспортом которой является плагин, включается АВТОМАТИЧЕСКИ. */
function bundledPluginEntries(): string[] {
  if (!fs.existsSync(DONOR_PLUGINS)) return []

  return fs
    .readdirSync(DONOR_PLUGINS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      ['plugin.tsx', 'plugin.ts', 'plugin.js']
        .map((file) => path.join(DONOR_PLUGINS, entry.name, file))
        .filter((candidate) => fs.existsSync(candidate))
    )
}

/** Все наши файлы, кроме тестов: регистрация роестра могла бы уехать куда
 * угодно, поэтому ищется не в одном ожидаемом месте, а во всех наших. */
function ourSourceFiles(): string[] {
  const found: string[] = []

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Зона донора — не наш код: их плагин обязан регистрироваться.
        if (entry.name === 'donor' || entry.name === 'node_modules') continue
        walk(full)
        continue
      }

      if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full)
    }
  }

  walk(RENDERER_SRC)

  return found
}

describe('в окне ровно один роестр (правило фазы 3D)', () => {
  it('их плагин на месте и будет подхвачен их же обнаружением', () => {
    const entries = bundledPluginEntries()

    expect(entries.map((file) => path.basename(path.dirname(file)))).toContain('hermes-bots')

    // Их обнаружение пропускает файл без валидного default-экспорта, и такой
    // плагин молча не зарегистрируется — с точки зрения окна это «роестра нет».
    const source = fs.readFileSync(
      entries.find((file) => file.includes('hermes-bots'))!,
      'utf8'
    )

    expect(source).toMatch(/export default\s*\{/)
    expect(source).toMatch(/register\s*\(ctx/)
  })

  it('НАШ роестр не регистрируется ниоткуда', () => {
    // Ищется сам факт регистрации вклада с нашим идентификатором панели, а не
    // импорт конкретного файла: снять импорт и оставить вызов в другом месте
    // — ровно тот способ, каким такое правило обходится незаметно.
    //
    // С задачи 3D.6 наш код роестра удалён, и проверка стала прямой: ни одного
    // такого файла быть не должно. До удаления тест был сложнее — приходилось
    // отличать «файл лежит» от «файл подключён», потому что `register.tsx` ещё
    // жил в дереве неподключённым.
    const offenders = ourSourceFiles().filter((file) => {
      const text = fs.readFileSync(file, 'utf8')

      return /id:\s*['"]aec-roster['"]/.test(text) && /registry\.register/.test(text)
    })

    expect(offenders).toEqual([])
  })
})
