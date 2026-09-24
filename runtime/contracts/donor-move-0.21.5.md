# План повторного переноса донора 0.21.3 → 0.21.5 (задача 3.B6а)

Замер 2026-09-24, **ДО подъёма пина**. Новый тег подтянут отдельным ref'ом и НЕ выкачен:
`git -C runtime/.hermes-src fetch --depth=1 --no-tags origin refs/tags/v2026.9.24:refs/aecpilot/v2026.9.24`.
Для чтения содержимого — `git worktree` на `f97608f1` в `%TEMP%/hermes-0.21.5-wt`; снимается после подъёма.

- **От:** `345cd2b057a452236de401d3534b8502a7465e8d` (`v2026.9.14`, ядро 0.21.3) — наш пин
- **До:** `f97608f178d1ffeca59860195ab7da295f7c8e5f` (`v2026.9.24`, ядро 0.21.5), 24 сентября

**Почему 0.21.5, а не 0.21.4.** Задача 3.B6 писалась под 0.21.4 (`v2026.9.21`); к моменту «go»
вышел `v2026.9.24` (0.21.5) — прямой потомок 0.21.4. Правило пина — последний доступный тег;
владелец 2026-09-24 велел поднимать сразу до него. Релизный коммит — тот же класс, что 9.14:
срез main без курируемых нот («Full curated notes … ship with v0.22.0»).

## Числа

| | 0.21.3 (3.B5) | **0.21.5 (3.B6)** |
|---|---|---|
| файлов в зоне | 1193 → 1246 после переноса | **1246** (78 с нашими правками) |
| изменилось у донора | 188 | **535** |
| из них с нашими правками | 25 | **65** + `desktop-slash-registry.json` (правка в `.provenance`) |
| исчезло источников | 3 | **16** (§3) |
| новых файлов донора (без тестов) | 39 | **202** в `apps/desktop/src` + `apps/shared/src` |
| новых npm-зависимостей донора | 0 | **1 рендерера** — `@novnc/novnc` (только экран Bot Desktop, §4); `dbus-native`, `https-proxy-agent`, `proxy-from-env` — их main-процесс, нам не нужны |
| новых Python-пакетов ядра | 1 (`pillow-heif`) | **0** — `httptools` 0.8.0 и `watchfiles` 1.2.0 уже стоят (раньше приходили через `uvicorn[standard]`), `uvloop` на Windows не ставится (маркер `sys_platform != 'win32'`), снятый extra `hindsight` не наш |

## Способ переноса

1. **Без наших правок (≈470 файлов)** — копия с нового SHA (`vendor-donor.mjs --list`).
2. **С нашими правками (66)** — копия с нового SHA и повторное наложение наборов из заголовка.
   Наложение механизировано трёхсторонним слиянием `git merge-file` (база — их файл на `345cd2b0`,
   «наши» — вендорный файл без шапки, «их» — файл на `f97608f1`): результат = новая копия плюс
   ровно наш дифф. После слияния дифф результата против их новой версии сверяется с заголовком —
   в нём не должно быть ничего, кроме перечисленных правок (правило 3 зоны донора соблюдено: это
   повторное наложение, а не подтяжка старого файла). Конфликты — вручную.
3. **Новые файлы** — замыкание импортов: берётся всё, до чего дотягиваются файлы зоны (иначе не
   соберётся), плюс новые поверхности по решениям §4.
4. **Исчезнувшие** — удаляются из зоны; наш код, который на них ссылался, переводится на новый адрес.

## 3. Источник исчез — 16

| Было | Стало |
|---|---|
| `app/skills/index.tsx` ✎[5], `mcp-tab.tsx`, `store.ts` | экран «Возможности» `app/capabilities/**` (маршрут `#/skills` → `#/capabilities`, известный сдвиг из 3.B6); [5] переносится на `capabilities/index.tsx` |
| `app/skills/plugin-packages.ts`, `plugins-tab.tsx`, `embedded-hub-picker.tsx` | переименованы в `app/capabilities/{plugins,skills}/…` |
| `store/mcp-setup.ts` | снят у них; **наш `aec/install-consent/agent-initiated.ts` импортирует `$mcpSetupRequests`** — согласие на установку MCP агентом переводится на их новый механизм (`connection.request` / `store/connection-request.ts`, §5) |
| `store/connector-flow.ts`, `lib/mcp-directory.ts` | каталог коннекторов переехал в `capabilities/connectors/**` и `lib/plugin-catalog.ts` |
| `first-build-connectors` ×2, `lib/first-build-start.ts`, `onboarding-chat/start.tsx` | сняты у них; у нас были мёртвыми (HX26, HX3) — строки `DEAD_SURFACE_FILES` снимаются |
| `store/cron-model-impact{,-scope}.ts` | сняты у них вместе с предупреждением о смене модели у расписаний |

## 4. Новые файлы донора — решения

Правило владельца 2026-09-05: что не подтверждено как «не берём» — берём. Поэтому семейство,
которое попадает под действующее HX, вендорится мёртвым (или не вендорится, если тянет зависимость),
а всё остальное берётся.

| Семейство | Файлы | Решение |
|---|---|---|
| Экран «Возможности» | `app/capabilities/**` (61): навыки, наборы инструментов, MCP, плагины, коннекторы | **берём** — это их замена экрана навыков. Размещённые коннекторы Nous внутри вкладки — HX3, как и раньше |
| Вопрос «подключить учётную запись» | `store/connection-request.ts`, `…/restore-pending-connection.ts`, `store/recovery-requests.ts`, метод `connection.respond`, события `connection.request/update` | **берём** — это новый путь согласия на подключение, наш мост его пропускает (§5) |
| Шкала времени ленты | `thread/timeline-*`, `store/thread-timeline.ts`, `response-group.tsx` | берём |
| Панель статуса композера, плавающий композер | `composer/status-stack/**`, `floating-*`, `composer-status-drawer.ts`, `restored-draft-notice.tsx` | берём |
| Скриншот в композер | `use-composer-screenshot.ts`, `settings/screenshot-settings.tsx` | берём; сторона main — наша реализация канала или честный отказ шима |
| Настройки: подстраницы, шрифт чата, трей, модификатор HUD, выбор модели | `settings/*-subpages.ts`, `chat-font-setting.tsx`, `minimize-to-tray-setting.tsx`, `hud-modifier-settings.tsx`, `model-select.tsx`, `settings-manifest.ts`, `themes/chat-font.ts` | берём |
| Группы и комнаты (`hermes-bots`) | `group-*` (5), `recent-session.ts` | берём |
| **Bot Desktop** — экран бота | `plugins/hermes-bots/screen-*` (8), методы `display.*`, маршрут `/api/display/ws`, `bot_desktop.*` в конфиге | **НЕ вендорится до решения владельца (D-145).** Ядро поднимает Xvnc/Xfce — только Linux; просмотрщик тянет `@novnc/novnc`. Вопрос: HX (не берём) или берём с зависимостью |
| Каталог плагинов, установка из каталога | `lib/plugin-catalog.ts`, `store/plugin-catalog-install.ts`, `catalog-install-tool.tsx`, `catalog-advanced-dialog.tsx` | берём (установка по согласию — та же политика UR23) |
| Онбординг: возможности, плагины, область | `store/onboarding-{capabilities,plugins,plugin-outcomes,scope}.ts`, `lib/onboarding-recommendations.ts`, `free-tier-setup-notice.tsx`, `persisted-handoff.ts` | мёртвыми — первый запуск донора HX26, бесплатный уровень Nous HX2 |
| Облачная команда | `settings/cloud-team-change.ts` | мёртвым — облако Nous HX2/HX3 |
| Переводы fr/de/es, заставки intro-* | `i18n/{fr,de,es}.ts`, `i18n/intro-*.ts` | вендорятся как их каталоги (правка [3] таблицы регистрации — только en+ru, SPEC C7) |
| WSLg, `sibling-ws-url`, `gateway-ws-url` | `shell/wslg-window-controls.tsx`, `lib/*-ws-url.ts` | берём, если дотягиваются импорты; WebSocket — через наш мост (C9, правка [1]) |
| Прочее | `sdk/{bridge,composer,sessions,settings}.ts`, `store/{custom-models,default-profile,external-links,interface-mode,model-assignment,profile-rail-prefs,sidebar-nav,terminal-backend-warning,text-direction}.ts`, `lib/*` остальные, `components/ui/*` | берём как есть |

## 5. Ядро — дифф контракта 0.21.3 → 0.21.5

Полный разбор — `reading-0.21.5.md`. Коротко: **сломалось 3** (снят дефолт
`auxiliary.background_review.max_input_tokens`, снят `gateway.auto_migrate`, снят extra
`hindsight`), **появилось 81**, **молча сменило умолчание 63** — из них 21 метод мы вызываем.

## 6. Гейт переноса

Как в 3.B5: `donor-report.mjs refs/aecpilot/v2026.9.24` → «изменившихся 0, исчезнувших 0»;
`pnpm -C apps/desktop build`; typecheck, eslint, prettier; vitest целиком; e2e smoke + acceptance
≥3 зелёных на одной сборке; pytest + ruff; три реестра паритета по нулю; все пробы ядра (пять проб
памяти обязательно, `server-requests-probe`, `cron-gateway-tick-probe` — из-за multiplex).
Падение пробы на приватном имени ядра сверяется с дифом ДО записи (ловушка 5).
