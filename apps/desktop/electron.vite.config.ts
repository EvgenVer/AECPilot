import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// REACT COMPILER (задача 3E.16, решение владельца 2026-09-09). Повторяем ИХ
// сборочную оптимизацию, потому что их перенесённые тесты на неё рассчитаны:
// `profile-config.tsx` зовёт `host.getGateway()` в ТЕЛЕ рендера, React проходит
// тело дважды, и без компилятора счётчик их теста получает 2 вместо 1 — из-за
// этого файл год стоял снятым с прогона (см. `vitest.config.ts`).
//
// ПУТЬ ДРУГОЙ, РЕЗУЛЬТАТ ТОТ ЖЕ. У донора компилятор подключён отдельным
// `@rolldown/plugin-babel` с `reactCompilerPreset()`; нам он недоступен — его peer
// требует vite ^8 и rolldown, у нас 7.3.6 (замерено веттингом 2026-09-08). Тот же
// babel-плагин включается параметром самого react-плагина.
//
// ЦЕНА ЗАМЕРЕНА ВСТРЕЧНО — одной и той же командой подряд (2026-09-09):
// сборка рендерера 55,6 с без компилятора против 2 м 52 с (172 с) с ним, то есть
// ВТРОЕ. Прежняя запись «114,8 с → 195 с» сравнивала холодную сборку с тёплой и
// потому занижала разницу; встречный замер её исправляет. Повторный замер того
// же дня дал 4 м 55 с — цифра плавает от загрузки машины, твёрдо в ней только
// направление: с компилятором сборка втрое дольше и хуже.
//
// ФИЛЬТР ДОНОРА ЗДЕСЬ НЕ ПОВТОРИТЬ, И ЭТО НЕ ЛЕНЬ. Донор сужает проход babel
// фильтром ПО СОДЕРЖИМОМУ файла (есть ли в нём JSX или импорт react) — у их
// `@rolldown/plugin-babel` такая точка есть. У `@vitejs/plugin-react` сужение
// только ПО ПУТИ (`include`/`exclude`), а по пути этого не узнать: их хуки лежат
// в `.ts` без JSX (`app/session/hooks/use-route-resume.ts` — импорт react и ни
// одного тега), и отбор по расширению сменил бы СЕМАНТИКУ, а не только время.
// Повторять их фильтр своим плагином — писать сборочный код ради ускорения,
// которого никто не мерил. Цена записана; решение о ней — владельца.
/** Их react-плагин с компилятором. Экспортируется, чтобы проект донора в
 *  `vitest.config.ts` брал РОВНО этот плагин: их код собирается в одной семантике
 *  мемоизации и здесь, и в сборке, а не в двух разных копиях настройки. */
export const reactWithCompiler = (): ReturnType<typeof react> =>
  react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } })

const here = path.dirname(fileURLToPath(import.meta.url))
const requireFromHere = createRequire(path.join(here, 'electron.vite.config.ts'))

// Экскурсия вклеивает СОБРАННЫЙ driver.js прямо в чужую страницу (задача
// 3E.12, UR36): `preview-tour.ts` берёт `driver.js/dist/driver.js.iife.js?raw`
// и отдаёт исходник гостю строкой. В карте `exports` пакета этого файла нет —
// ни его, ни `./package.json`, — поэтому сборка падает на «Missing specifier».
// Решается тем же способом, что и у донора: резолвим главный вход
// (`dist/driver.js.cjs`) и указываем на его соседа по папке. Оба ключа
// намеренно: сопоставление псевдонимов ТОЧНОЕ, а запрос `?raw` в dev доезжает
// сюда, а на некоторых путях сборки срезается раньше.
const driverIifePath = path.join(
  path.dirname(requireFromHere.resolve('driver.js')),
  'driver.js.iife.js'
)

// The three aliases that let vendored donor files keep their own imports (see
// `src/renderer/src/donor/README.md`):
//   `@/…`                their src root → our donor zone, which mirrors it
//   `@hermes/shared`     their workspace package → our shim, which re-exports the
//                        parts we vendored and swaps their WebSocket client for the
//                        IPC bridge (SPEC C9)
//   `@hermes/plugin-sdk` their plugin language → the SDK barrel we already
//                        vendored. In THEIR tree this alias resolves the same way
//                        (`tsconfig.json`: `./src/sdk/index.ts`), so it is not a
//                        substitution — it is the same mapping, pointed at our copy.
//                        Without it their plugin's 37 SDK importers would have to be
//                        edited, and editing them is not one of the five allowed
//                        donor edits (задача 3D.1).
//
// ORDER MATTERS. Vite replaces on a string prefix, so `@` would swallow
// `@hermes/…` if it came first. Both `@hermes/*` entries stay above it.
export const donorAliases = {
  'driver.js/dist/driver.js.iife.js?raw': `${driverIifePath}?raw`,
  'driver.js/dist/driver.js.iife.js': driverIifePath,
  '@hermes/shared': path.resolve(here, 'src/renderer/src/shared/hermes-shared'),
  '@hermes/plugin-sdk': path.resolve(here, 'src/renderer/src/donor/sdk'),
  '@': path.resolve(here, 'src/renderer/src/donor')
}

export default defineConfig({
  main: {},
  // Two preloads: the main window's ~150-member bridge, and the quick-entry
  // window's two verbs (task 3.15). A capture box has no business holding the
  // API the application window needs.
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(here, 'src/preload/index.ts'),
          'quick-entry': path.resolve(here, 'src/preload/quick-entry.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [reactWithCompiler(), tailwindcss()],
    resolve: { alias: donorAliases },
    // driver.js попадает в граф только через ДИНАМИЧЕСКИЙ импорт экскурсии, и
    // сканер зависимостей его на старте не видит. Без этой строки первое же
    // обращение регистрирует его как новую зависимость: esbuild пребандлит
    // `?raw`-импорт как модуль (и сырой текст превращается в «нет экспорта
    // default»), а окно перезагружается посреди сессии. Пакет чистый ESM без
    // CJS-зависимостей — отдать его неоптимизированным ничего не стоит.
    optimizeDeps: {
      exclude: [
        'driver.js',
        'driver.js/dist/driver.js.iife.js',
        'driver.js/dist/driver.js.iife.js?raw',
        'driver.js/dist/driver.css?raw'
      ]
    },
    // Its own HTML entry rather than a route of the main one: mounting the
    // whole shell to show one input would boot their application twice, and
    // this window must appear in the time it takes to press a chord.
    build: {
      // Шрифт НИКОГДА не вклеивается в CSS как `data:` (находка D-60).
      //
      // Наша CSP — `default-src 'self'` без `font-src` (`src/renderer/index.html`),
      // то есть вклеенный шрифт запрещён. Умолчание Vite вклеивает всё легче
      // 4 КиБ, и под порог попадает ровно один файл: `KaTeX_Size3` из
      // `katex.min.css`, который их `styles.css` импортирует. Браузер отвергает
      // его загрузку, а `page.addStyleTag` в e2e считает это своей ошибкой —
      // отсюда падало восемь проверок подряд, начиная с первой, которая прячет
      // экраны первого запуска.
      //
      // Ослаблять CSP до `font-src data:` ради этого не нужно: файлом шрифт
      // проходит как `'self'`, и правило остаётся строгим.
      assetsInlineLimit: (filePath: string) =>
        /\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined,
      rollupOptions: {
        input: {
          index: path.resolve(here, 'src/renderer/index.html'),
          'quick-entry': path.resolve(here, 'src/renderer/quick-entry.html')
        }
      }
    }
  }
})
