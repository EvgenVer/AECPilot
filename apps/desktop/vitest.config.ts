import { defineConfig, configDefaults } from 'vitest/config'
import { donorAliases, reactWithCompiler } from './electron.vite.config'

// REACT COMPILER — ТОЛЬКО У ПРОЕКТА ДОНОРА, и это замер, а не осторожность
// (задача 3E.16, 2026-09-09). Берётся РОВНО тот плагин, которым собирается
// приложение: один источник на оба пути.
//
// СНАЧАЛА ОН СТОЯЛ У ВСЕХ ТРЁХ ПРОЕКТОВ С ДЕРЕВОМ REACT — по верному доводу «тест
// обязан проверять то, что собирается». Замер полного прогона этот довод не отменил,
// но показал цену: наши тесты с компилятором ЗЕЛЁНЫЕ (2682 прошло, ни одного падения
// в `dom`/`heavy` — значит наш код его не ломает), однако трансформация выросла с 27 с
// до 103 с, и под этой нагрузкой истёк на 15 с чужой сосед — узловой
// `sheet-read.test.ts`, который в одиночку проходит за 478 мс. Это четвёртый случай
// одного и того же класса (D-64, D-68, D-70): тест падает не от своей правки, а от
// того, что рядом.
//
// Поэтому компилятор остаётся там, где его требует КОД: их `profile-config.tsx`
// рассчитан на него и без него роняет их же тест. Факт «наши компоненты компилятор не
// ломает» записан здесь замером, а не оставлен на вере.
const reactCompiler = reactWithCompiler

// e2e/** is Playwright's test suite (task 0.16), not vitest's — its own
// config (playwright.config.ts) runs it via `pnpm e2e`.
const exclude = [...configDefaults.exclude, 'e2e/**']

// У ЗОНЫ ДОНОРА СВОЙ ПРОЕКТ (задача 3D.2), повторяющий их собственный.
//
// Их тесты писаны под их конфигурацию, и она отличается от нашей тремя вещами
// сразу: весь `src` идёт под jsdom (а у нас деление по расширению), включён
// `globals: true` (без него `@testing-library/react` не вешает автоочистку, и
// DOM предыдущего теста остаётся — «Found multiple elements with the role
// button»), и подключён их `vitest.setup.ts` (Node 26 и localStorage,
// act-окружение React 19, потолок ожидания 12 с).
//
// Подогнать их набор под наши правила можно было бы только правкой их файлов, а
// это не входит в пять разрешённых видов (AGENTS §14). Поэтому подгоняем не их,
// а конфигурацию — и повторяем именно ту, под которую их тесты написаны.
// Измерено при переносе: без jsdom падало 25 тестов из 563, без `globals` — ещё 5.
const DONOR_ZONE = 'src/renderer/src/donor/**/*.test.{ts,tsx}'

// ИХ ОБЩИЙ ПАКЕТ (`apps/shared`, у нас `donor/hermes-shared/`) — ОТДЕЛЬНО И ПОД
// NODE (пин 0.21.3, задача 3.B5в). Его тесты приехали вместе с модулями и
// писаны под пакет без DOM: у `apps/shared` в зависимостях один typescript, и
// `i18n.test.ts` прямо утверждает `typeof document === 'undefined'` — под jsdom
// проекта донора это ложь. Тот же довод, что у проекта донора выше: не править
// их файлы под нашу конфигурацию, а повторить ту, под которую они написаны.
const DONOR_SHARED = 'src/renderer/src/donor/hermes-shared/**/*.test.ts'

// ВСЕ перенесённые тесты снова в прогоне (задача 3E.16, 2026-09-09). Запись
// оставлена провенансом: ровно этот файл год держался снятым, и причина была
// измерена, а не предположена.
//
// `profile-config-capabilities.test.tsx` требует, чтобы окно прочло шлюз РОВНО ОДИН
// раз (`expect(sdk.gatewayReads.count).toBe(1)`), а у нас читало дважды: их же
// `profile-config.tsx` делает `if (!loaded) setLoaded(true)` В ТЕЛЕ РЕНДЕРА (их
// комментарий: «Component body = render path»), React отвечает повторным проходом,
// а `host.getGateway()` стоит в теле — значит вызывается на каждом проходе.
//
// У НИХ ЭТОТ ТЕСТ ПРОХОДИЛ ПОТОМУ, что их тестовый проект наследует их сборку с
// React Compiler: компилятор не убирает повторный проход, но мемоизирует вызов
// ВНУТРИ него, и второй проход берёт закешированный `getGateway()`. Расхождение
// было НЕ нашим и правкой кода не чинилось — только повторением их сборочной
// оптимизации, а это решение владельца. Принято 2026-09-09: компилятор включён в
// сборке и ЗДЕСЬ, у проекта донора, — у наших проектов его нет по замеру времени
// (см. заголовок файла).

// Замечание D-64, третий случай — и потому НЕ третье поднятие потолка.
//
// Строчкой ниже, у проекта `dom`, стоит обещание, данное при втором поднятии:
// «If it happens a third time the answer is not a bigger number — it is running
// the heavy-import files in their own group». Случилось (2026-09-08, полный
// прогон): `markdown-editor.test.tsx` истёк на `waitFor`, в DOM висело
// «Открываю документ…», а повторный прогон без единой правки прошёл целиком.
//
// ЗАМЕР, ОТ КОТОРОГО ЭТО СДЕЛАНО: тот же файл в одиночку поднимает редактор за
// 369 мс. Значит дело не в файле, а в том, что ЧЕТЫРЕ рабочих `dom` разом
// строят своё дерево модулей, и на загруженной машине тяжёлому не достаётся
// процессора. Своя группа с ОДНИМ рабочим убирает конкуренцию, а не прячет её
// за большим числом.
//
// Список именной, а не по маске: сюда попадает файл, ПРО КОТОРЫЙ ЗАМЕРЕНО, что
// он мигает, — не всякий, который кажется тяжёлым.
const HEAVY_DOM = ['src/renderer/src/aec/viewers/markdown-editor.test.tsx']

// Замечание D-64, их сторона (пин 0.21.5, задача 3.B6). Их барьер SDK теперь
// реэкспортирует экран возможностей, разметку сообщений и прочее — и тесты
// плагина специалистов, которые в `beforeAll` поднимают НАСТОЯЩИЙ SDK через
// `importOriginal`, платят за весь этот граф. Замер на этой машине: импорт
// `./data` — 87 с, почти всё — прогон исходников через React Compiler; их же
// потолок хука — 60 с, прописан в их файле, и поднять его нельзя без правки.
//
// Компилятор этим файлам не нужен: он держит у нас ровно одно — счёт проходов
// рендера (см. выше), а здесь проверяется логика хранения, без рендера. Своя
// группа без компилятора и в один рабочий — то же лекарство, что у `heavy`.
const HEAVY_DONOR = [
  'src/renderer/src/donor/plugins/hermes-bots/bot-delete.test.ts',
  'src/renderer/src/donor/plugins/hermes-bots/hidden-bots.test.ts'
]

// Two projects instead of one environment (task 1.6.3): component tests need
// a DOM, the ~450 existing pure/main-process tests do not, and jsdom costs
// real time per file. The split is by extension — `*.test.tsx` renders React
// and gets jsdom, `*.test.ts` stays on node — so a test file declares its own
// environment by what it is, with nothing to keep in sync here. Единственное
// исключение — зона донора, см. выше.
export default defineConfig({
  // Same aliases the renderer build uses, so a vendored donor file resolves
  // identically under vitest and under vite.
  resolve: { alias: donorAliases },
  test: {
    projects: [
      {
        resolve: { alias: donorAliases },
        test: {
          name: 'node',
          environment: 'node',
          exclude: [...exclude, '**/*.test.tsx', DONOR_ZONE],
          // exceljs идёт в Node как есть (задача 4.3). Через конвейер vitest
          // его мегабайтная CJS-сборка со всем деревом зависимостей едет 48
          // секунд против 0,2 секунды у самого Node — измерено. В сборке
          // главного процесса этого шага нет вовсе.
          server: { deps: { external: ['exceljs'] } },
          // Task D-33. Same ceiling as the DOM project below, and for the same
          // reason: `sheet-read.test.ts` really opens and parses a workbook, and
          // under a full parallel run on a busy machine that outran the 5 s
          // default — while passing in 2,8 s in isolation. The assertion waits
          // for work to finish, not for a timer, so a higher ceiling costs
          // nothing when the machine is idle.
          testTimeout: 15000,
          // The two projects have different worker limits (see 'dom' below),
          // and vitest refuses to schedule differing limits in one group — so
          // they run as two groups: the fast node suite first, then the DOM
          // one on its own.
          sequence: { groupOrder: 0 }
        }
      },
      {
        resolve: { alias: donorAliases },
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude: [...exclude, DONOR_ZONE, ...HEAVY_DOM],
          // Component files grew from 1 to 12 in batches 2–3, and each one
          // pays for its own jsdom instance. Run at most four at a time: on a
          // loaded machine the unbounded pool starved workers badly enough
          // that files failed to start at all (vitest's worker-start limit is
          // a hard 60 s) and `waitFor`'s 1 s default expired on renders that
          // are instant when the machine is idle. Measured: the same files
          // pass in isolation and fail only in a full parallel run.
          maxWorkers: 4,
          sequence: { groupOrder: 1 },
          // Milkdown и его ProseMirror идут в Node как есть (задача 4.5): через
          // конвейер vitest их дерево модулей едет полторы минуты, снаружи —
          // секунды. Ровно та же причина, что у exceljs выше.
          server: { deps: { external: [/@milkdown/, /prosemirror/] } },
          // Same reason: the assertions wait for a promise chain to settle,
          // not for a timer, so a longer ceiling costs nothing when things are
          // fast and stops a green suite from turning red under load.
          //
          // Raised 15 s → 30 s for D-33: fifteen still was not enough for the
          // Milkdown editor tests during a full run on a loaded machine (twice
          // in one session), and they pass in seconds on their own. This is the
          // SECOND raise. If it happens a third time the answer is not a bigger
          // number — it is running the heavy-import files in their own group,
          // the way the node/dom split already works.
          testTimeout: 30000
        }
      },
      {
        // runtime/ holds the core-watching tools (task 1.7.5): plain .mjs, no
        // Electron, no DOM. They live outside this app because the app is only
        // one of their callers, but `pnpm test` is the only test runner this
        // repo has — a tool nobody runs is a tool nobody trusts. Its own root
        // keeps the app's globs from reaching into the vendored core checkout
        // under runtime/.hermes-src.
        test: {
          name: 'runtime',
          root: '../../runtime',
          environment: 'node',
          include: ['*.test.mjs'],
          sequence: { groupOrder: 0 }
        }
      },
      {
        plugins: [reactCompiler()],
        resolve: { alias: donorAliases },
        test: {
          name: 'donor',
          environment: 'jsdom',
          include: [DONOR_ZONE],
          exclude: [...exclude, DONOR_SHARED, ...HEAVY_DONOR],
          globals: true,
          setupFiles: [
            './src/renderer/src/donor/vitest.setup.ts',
            './src/renderer/src/shared/donor-test-locale.ts'
          ],
          // Их же потолок и их же довод: первый тест в файле платит за поднятие
          // jsdom и полную трансформацию модулей, и под нагрузкой это выходит за
          // умолчательные 5 с.
          testTimeout: 15000,
          // Их `beforeAll` прогревает загрузку модулей и сам отводит себе 60 с,
          // с их же пояснением: под загруженным прогоном это не укладывается.
          // 102 файла плагина тянут барьер SDK на 1750 строк, и каждый рабочий
          // трансформирует его заново — четыре рабочих отбирали время друг у
          // друга ровно на этом. Два: медленнее по стене, но проходит.
          maxWorkers: 2,
          sequence: { groupOrder: 2 }
        }
      },
      {
        // Их общий пакет под Node (см. DONOR_SHARED выше): чистые модули, ни
        // React, ни DOM — идёт в быстрой узловой группе.
        resolve: { alias: donorAliases },
        test: {
          name: 'donor-shared',
          environment: 'node',
          include: [DONOR_SHARED],
          exclude,
          sequence: { groupOrder: 0 }
        }
      },
      {
        // Тяжёлые по импорту (замечание D-64, см. HEAVY_DOM выше). Отдельной
        // группой и в ОДИН рабочий: файл поднимается за 369 мс в одиночку и
        // истекал на тридцати секундах, пока делил процессор с тремя соседями.
        resolve: { alias: donorAliases },
        test: {
          name: 'heavy',
          environment: 'jsdom',
          include: HEAVY_DOM,
          maxWorkers: 1,
          // Тот же вынос из конвейера, что и у `dom`: их дерево модулей едет
          // через vitest полторы минуты, снаружи — секунды.
          server: { deps: { external: [/@milkdown/, /prosemirror/] } },
          testTimeout: 30000,
          sequence: { groupOrder: 3 }
        }
      },
      {
        // Тяжёлые их (см. HEAVY_DONOR выше): их настройки проекта донора, но без
        // React Compiler и в один рабочий.
        resolve: { alias: donorAliases },
        test: {
          name: 'donor-heavy',
          environment: 'jsdom',
          include: HEAVY_DONOR,
          globals: true,
          setupFiles: [
            './src/renderer/src/donor/vitest.setup.ts',
            './src/renderer/src/shared/donor-test-locale.ts'
          ],
          // Пин 0.22.2: холодный граф SDK дольше их потолка хука — см. файл.
          globalSetup: ['./src/renderer/src/shared/donor-heavy-warmup.ts'],
          testTimeout: 15000,
          maxWorkers: 1,
          sequence: { groupOrder: 4 }
        }
      }
    ]
  }
})
