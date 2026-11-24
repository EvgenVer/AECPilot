// Вторая половина требования C12: строки, вшитые прямо в код их экранов.
//
// Каталог держит `no-hermes.test.ts`, но часть текста у донора живёт литералами
// и мимо каталога не проходит — «AECPilot is thinking» в ленте, ошибки шлюза,
// описания каналов, подпись слова-активатора. Их правит правка [5] (AGENTS §14,
// разрешена владельцем 2026-08-20), а этот тест не даёт им вернуться при
// следующем переносе донора: он читает ИСХОДНИКИ зоны и падает на любом новом
// литерале с их именем.
//
// ЧТО ПРОПУСКАЕТСЯ И ПОЧЕМУ. (0) ТЕСТЫ зоны — не интерфейс: их ожидание
// (`expect(...).toBe('Hermes')`) описывает поведение их же кода и человеку не
// показывается. Правило добавлено при переносе их плагина специалистов (задача
// 3D.2): до него в зоне не было ни одного теста, и вопрос не возникал.
// (1) Комментарии — не интерфейс: пояснение «этот
// текст раньше говорил Starting Hermes…» рассказывает историю строки и должно
// остаться правдой. (2) Технические вхождения — ключи хранилища, имена событий
// окна, типы MIME, партиции, классы CSS, пути REST, имена их модулей и типов:
// человек их не видит, а переименование сломало бы совместимость с их же кодом
// (то же исключение записано в SPEC C12). (3) `lib/voice-stop-word.ts` — там не
// подписи, а ФРАЗЫ, которые человек произносит вслух, чтобы прервать ответ;
// менять их вместе с именем продукта — это задача про голос (3.7b), а не про
// надпись. По тому же основанию пропускается слово-активатор `hey hermes`:
// это то, что человек ГОВОРИТ, и менять его — решение про голос, не про текст.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const ZONE = join(__dirname, '..', '..', 'donor')

/** Чужие каталоги переводов: их языки не предлагаются (SPEC C7), а английский
 * и — с 0.21.2 — их русский переписываются на лету (`debrand.ts`; собранные
 * каталоги мерит `no-hermes.test.ts`). */
const SKIP_FILES = new Set([
  'en.ts',
  'ru.ts',
  'ar.ts',
  'ja.ts',
  'zh.ts',
  'zh-hant.ts',
  // 0.21.5 (3.B6): ещё три их языка и их заставки первого запуска (HX26) на
  // тех же языках — не предлагаются (C7), как и три выше.
  'fr.ts',
  'de.ts',
  'es.ts',
  'intro-de.ts',
  'intro-es.ts',
  'intro-fr.ts',
  'intro-ja.ts',
  'intro-zh.ts',
  'intro-zh-hant.ts',
  // 0.23.3 (T86): слои строк комнат на языках, которые не предлагаются (C7); русский
  // слой их же (`group-surface-ru.ts`) не импортируется — строку `ru` держит наш каталог.
  'group-surface-ar.ts',
  'group-surface-de.ts',
  'group-surface-es.ts',
  'group-surface-fr.ts',
  'voice-stop-word.ts'
])

/** Файлы поверхности, которой в продукте НЕТ: их онбординг-чат (SPEC HX26).
 * Регистрация снята в `wiring.tsx` (правка [3]), флаг `guestOnboardingEnabled`
 * объявлен отсутствующим в шиме, и весь чат стоит за `isOnboardingEnabled()`.
 * Здесь лежат его промпты и имя его профиля — человеку не показываются, агенту
 * не отправляются. Переписывать промпт мёртвого кода значило бы править
 * инструкцию агента, которую никто не исполняет. Если HX26 когда-нибудь
 * пересмотрят, строки снимаются отсюда, и гвард потребует правку [5].
 *
 * Третий файл — их живой голосовой разговор (SPEC HX19, не берём; пин 0.21.3,
 * задача 3.B5ж): реплики, которые он ПРОИЗНОСИТ. Что его никто не зовёт,
 * держит `voice-boundary.test.ts`. */
const DEAD_SURFACE_FILES = new Set([
  // 0.22.2 (T20.7): их онбординг-чат ушёл из их дерева вместе со своими
  // промптами (`onboarding-chat/*`, `onboarding-script.ts`) — три прежние
  // строки этого списка сняты вместе с файлами.
  join('app', 'chat', 'composer', 'hooks', 'use-voice-live-conversation.ts'),
  // Окно проверки их бесплатного тарифа (SPEC HX3) — файл ИХ главного
  // процесса, в зоне ради типов `global.d.ts`; наш главный процесс его не
  // открывает, и заголовок окна никто не увидит.
  join('hermes-electron', 'challenge-window.ts'),
  // 0.23.0 (T52): их веб-приложение (SPEC HX33, не берём): вход браузера по
  // билету, браузерные уведомления, транспорт к шлюзу из вкладки, отказ
  // `/browser` во вкладке. Работают только на хосте `browser`
  // (`lib/host-capabilities.ts`), а наш хост — `native`; `webapp.enabled`
  // ядро держит выключенным (`agent-defaults-pure.ts`).
  join('lib', 'browser-launch-session.ts'),
  join('lib', 'browser-notifications.ts'),
  join('lib', 'browser-transport.ts'),
  join('app', 'session', 'hooks', 'use-prompt-actions', 'browser-manage-refusal.ts'),
  // 0.23.3 (T86): сохранённые подключения их веб-приложения (HX33) — зовут
  // `lib/browser-connection.ts` хоста `browser` и поле `webapp-oauth-paste-field.tsx`
  // (в окне приложения оно ничего не рисует). Если поле начнёт рисоваться — убрать
  // строку отсюда, и страж увидит их тексты.
  join('lib', 'browser-saved-connections.ts'),
  join('lib', 'browser-saved-connection-oauth.ts'),
  // 0.23.3 (T86): палитра их раздела «Резервная копия» — перенос в Hermes Cloud (HX3);
  // её регистрации сняты правкой [3] в `command-palette/index.tsx` и `contrib/surfaces.tsx`.
  join('app', 'settings', 'backup-palette.ts'),
  // T90 (UR57): из `agent-transfer.ts` живёт только `runBackup` (копия в файл); их имя
  // называет одна строка ПЕРЕНОСА в Hermes Cloud (HX3), до которой в окне никто не доходит —
  // карточка переноса снята правкой [3] в `backup-settings.tsx`. Если перенос когда-нибудь
  // вернут, строку убрать отсюда, и страж потребует правку [5].
  join('lib', 'agent-transfer.ts')
])

/** Их каталоги, разрезанные по разделам (0.22.2, T20.7): `ar_boot.ts`,
 * `en_settings.ts`, `types_billing.ts` … — части тех же каталогов, что
 * пропускаются выше целиком, и судьба у них та же: английский и русский
 * переписывает `debrand.ts`, остальные языки не предлагаются (C7). */
const SPLIT_CATALOG = /^(ar|de|en|es|fr|ja|ru|zh|zh-hant|types)_[a-z_]+\.ts$/

const TECHNICAL = new RegExp(
  [
    'hermesDesktop',
    '@hermes/',
    'data-hermes',
    'hermes-desktop',
    'hermes\\.desktop',
    'x-hermes',
    'persist:hermes',
    'HERMES_[A-Z_]+',
    '~/\\.hermes',
    '\\.hermes/',
    '@/hermes',
    'types/hermes',
    "/hermes'",
    'use-hermes-config',
    'hermes-boot',
    'Hermes[A-Z][A-Za-z]*', // их типы: HermesGitBranch, HermesReviewFile, …
    'hermes-agent',
    'hermes:[a-z-]', // события окна: hermes:composer-submit, …
    'hermes/work-',
    'hermes-config',
    'hermes-not-found',
    '__hermes_empty__',
    'hermes-terminal',
    'cc-update-hermes',
    'hermes-skill-pick',
    'hermes-(ig|tt|tw)-embed',
    'hermes-inline-preview',
    'window\\.hermes=', // имя API внутри изолированной рамки живого блока
    'cm-hermes',
    'hermes-onboarding',
    'hermes-zone-fade',
    'hermes\\.plugin\\.',
    'hermes-media://',
    '/api/hermes/',
    'hermes update', // команда их CLI на экране обновлений (HX4)
    // Пополнение при переносе их плагина (задача 3D.2). Тот же класс, что
    // `hermes update` выше: это ИМЯ ИСПОЛНЯЕМОГО ФАЙЛА, которое человек
    // набирает в терминале. Ядро у нас действительно называется `hermes`, и
    // переписать команду значило бы напечатать на экране то, что не сработает.
    'hermes model', // «run hermes model» в подсказке о ненастроенном провайдере
    'hermes -p ', // сборка команды для расписаний и SOUL
    'hermes profile list', // подсказка агенту, где взять живой список
    'hermes project', // подсказка доски, как завести проект (задача 3E.13)
    // Экранирование ДВОЙНОЕ: список уходит в `new RegExp`, и одинарное `\(`
    // дало бы строку `hermes()` — регулярку «hermes плюс пустая группа»,
    // то есть разрешение ЛЮБОГО литерала со словом hermes. Поймано eslint.
    'hermes\\(\\)', // определение шелл-функции в их тесте расписаний
    'hermes-update',
    'notifications\\.updateHermes', // ключ каталога, а не текст
    "^'hermes'$", // псевдоним основного профиля и слово для поиска в палитре
    // Пополнение при подъёме донора на 0.20.5 (задача 3.B1) — все технические:
    'hermes-open-target', // имя их модуля (`lib/hermes-open-target`)
    'hermes-bots', // идентификатор их панели: `hermes-bots:pane`
    "^'hermes:'$", // схема их ссылок, целиком
    'hermes://', // она же в собранном виде
    'hermes\\.transcript-tail', // ключ их локального хранилища
    'hey hermes', // слово-активатор: его человек ПРОИЗНОСИТ (см. шапку файла)
    // Пополнение при возврате экскурсии и нажатий в предпросмотре (задача
    // 3E.12) — все семь вхождений технические, ни одно не показывается
    // человеку. Это ИМЯ СВОЕГО ЭЛЕМЕНТА и идентификаторы слоёв, которые
    // движок вписывает в ЧУЖУЮ страницу: накладка ищет свой прежний хост по
    // имени тега, а слой подсветки — свой слой и свою маску по `id`.
    // Переименовать их значило бы разойтись с их же исходником, который
    // вклеивается в гостя строкой (`toString()`), — и заодно выйти за пять
    // разрешённых видов правок (AGENTS §14).
    'hermes-watch', // имя их пользовательского элемента накладки
    'HERMES-WATCH', // оно же в верхнем регистре: сравнение с `tagName`
    '__hermes-tour-', // id слоёв экскурсии: стиль, подсветка, маска
    // Пополнение при подъёме донора на 0.21.2 (задача 3.B4) — все технические.
    // Первые два — аннотации на предпросмотре, тот же класс, что `hermes-watch`
    // выше: имя элемента-хоста, который движок вписывает в чужую страницу, и
    // имя API внутри неё (`window.__hermesAnnotate`).
    'hermes-annotate',
    '__hermesAnnotate',
    'hermes-plugin-pick', // тип сообщения выбора из каталога плагинов, как `hermes-skill-pick`
    '\\.hermes-package\\.json', // маркер-файл рядом с половиной пакета плагина
    // Ключи их локального хранилища: квитанция передачи онбординга (с 0.21.3 —
    // всё семейство `hermes.onboarding.*`: ещё «первая сборка» и её коннекторы,
    // задача 3.B5), «заставку видели», время последней фоновой проверки
    // обновлений.
    'hermes\\.onboarding\\.',
    'hermes-intro-reveal-seen',
    'hermes\\.updates\\.',
    "^'hermes-setup'$", // имя ПРОФИЛЯ их онбординг-гида — ключ реестра профилей
    // Пополнение при подъёме донора на 0.21.5 (задача 3.B6) — все технические:
    'hermes\\.connectors\\.', // ключи их локального хранилища коннекторов
    '\\.restartHermes', // ключ каталога, как `notifications.updateHermes`
    'hermes_tool_labels', // имя аргумента строки инструмента, которое модель не видит
    // Пополнение при подъёме донора на 0.22.2 (задача T20.7) — все технические:
    '__hermesPrintGuard', // флаг, который предпросмотр вписывает в ЧУЖУЮ страницу
    '\\[Hermes\\] Printing is disabled', // строка консоли той страницы, не экрана
    "^'hermes-root'$", // имя корня в их типах моста
    '^`hermes`$', // имя исполняемого файла ядра в их типах
    'hermes_not_connected', // код ошибки, а не текст
    'hermes_connection_op', // имя операции в их журнале подключений
    // Пополнение при подъёме донора на 0.23.0 (задача T52) — все технические:
    'hermes-gateway-v1', // имя подпротокола WebSocket их шлюза (и в контракте ядра)
    'hermes-gateway-ticket\\.', // префикс билета в подпротоколе
    'hermes-cloud-host', // путь их модуля (`@/lib/hermes-cloud-host`)
    'hermes-preview-document', // тип сообщения рамки предпросмотра
    'hermes-guest-loaded', // тип сообщения гостевой рамки
    'hermes-voice-level', // имя их AudioWorklet
    'open_hermes_folder', // код действия на карточке ошибки
    'historyHermes', // ключ каталога, а не текст
    'hermesHandleTaken', // код ошибки роестра
    'hermes gateway ensure', // команда их CLI в тексте ошибки, как `hermes update`
    'requiresHermes', // имя поля записи каталога внутри шаблона
    // Пополнение при подъёме донора на 0.23.3 (задача T86) — оба технические:
    '\\.hermes-origin\\.json', // маркер-файл установленного пакета плагина, как `.hermes-package.json`
    'hermes gateway run' // команда их CLI в подсказке, как `hermes gateway ensure`
  ].join('|')
)

const LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      sourceFiles(path, out)
      continue
    }
    if (!/\.tsx?$/.test(entry) || SKIP_FILES.has(entry)) continue
    if (SPLIT_CATALOG.test(entry) && dir.endsWith('i18n')) continue
    if (/\.test\.tsx?$/.test(entry)) continue // тесты зоны — не интерфейс, см. шапку
    if (DEAD_SURFACE_FILES.has(path.slice(ZONE.length + 1))) continue
    out.push(path)
  }
  return out
}

/** Литералы строки кода. Строки комментариев отбрасываются целиком — разбирать
 * их синтаксически ради этой проверки незачем. */
function literalsOfLine(line: string): string[] {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return []
  return line.match(LITERAL) ?? []
}

describe('в коде их экранов нет их имени на виду (SPEC C12)', () => {
  it('ни один строковый литерал зоны донора не называет их продукт', () => {
    const offenders: string[] = []

    for (const file of sourceFiles(ZONE)) {
      const lines = readFileSync(file, 'utf-8').split(/\r?\n/)

      lines.forEach((line, index) => {
        for (const literal of literalsOfLine(line)) {
          if (!/hermes/i.test(literal)) continue
          if (TECHNICAL.test(literal)) continue
          offenders.push(`${file.slice(ZONE.length + 1)}:${index + 1} ${literal}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })
})
