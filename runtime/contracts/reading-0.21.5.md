# Разбор контракта ядра 0.21.3 → 0.21.5 (задача 3.B6б)

Слепок `hermes-0.21.5.json` снят 2026-09-24 с живого реестра дерева `f97608f1` (worktree
`%TEMP%/hermes-0.21.5-wt`, `contract-snapshot.mjs --core … --version 0.21.5`, формат 4):
методов 237 в 78 модулях (было 215), маршрутов 275 (было 267), дефолтов конфига 921 (было 877).
Сравнение — `node runtime/contract-diff.mjs`: сломалось 3, появилось 81, молча сменило 63.

## 1. Сломалось — 3, нас не касается ни одно

| Что | Почему не касается |
|---|---|
| снят дефолт `auxiliary.background_review.max_input_tokens` | мы его не пишем и не читаем |
| снят дефолт `gateway.auto_migrate` | заменён `gateway.auto_multiplex_migration`; срабатывает только в `hermes update`, который мы не зовём (R10, их обновление — не наш путь) |
| снят extra `hindsight` | ставим `[mcp,mem0]`, провайдер памяти — Mem0 |

## 2. Наши методы с изменившимся телом — 21, все «не касается параметров»

Параметры читаются те же. Три «исчезнувших умолчания» — ловушка 1 (ложные): `session.create`
(`cols=80`) и `session.branch` (`name=""`) переехали в общие `_create_session` / `_branch_live`
с теми же умолчаниями; `config.show` (`HERMES_BASE_URL`) теперь читается через `get_secret`, а не
`os.environ`.

| Метод | Что изменилось | Нас касается? |
|---|---|---|
| `session.create` | тело вынесено в `_create_session` (+ новый `session.branch_stored`) | нет — `cols`, `messages`, `profile`, `cwd`, `source` читаются как раньше; наш `applyProjectCwd` цел |
| `session.branch` | → `_branch_live` (+ `session.branch_whole`) | нет — вызывает их код |
| `prompt.submit` | необязательный `title_preview`; усечение истории во время хода → ошибка 4009 «session busy» (их `runRewindSubmit` повторяет сам) | нет |
| `reload.mcp` | обновление живых сессий вынесено в `_refresh_live_sessions`; повторный обход — в области профиля запуска (иначе секреты stdio-серверов не читались при multiplex, #113746) | нет; проба `mcp-project-switch-probe` |
| `command.dispatch`, `commands.catalog`, `skills.reload` | обход в области профиля и **рабочей папки сессии** (#110695, #114359) | **да, в лучшую сторону** — навыки проекта (UR29) теперь видны в каталоге команд сессии этого проекта; проба `skill-priority-probe` |
| `complete.path`, `complete.slash` | необязательный `session_id` | нет |
| `config.show` | `get_secret` вместо `os.environ`; путь конфига — активного профиля | нет |
| `config.set`, `plugins.manage` | + действия `remove`, `settings` у плагинов | нет |
| `rollback.diff`, `rollback.restore` | отказ для чекпойнта контейнера; текст «session busy» | нет — у нас локальный терминал |
| `session.compress`, `session.undo` | текст «session busy» через `busy_message(...)` | нет (e2e на текст не опираются — сверить при прогоне) |
| `session.context_breakdown` | + `context_files` — какие файлы контекста агент взял | нет; их поповер покажет больше |
| `session.history` | вложения из профиля сессии | нет |
| `session.usage` | + `account_lines` — лимиты учётной записи провайдера | нет |
| `setup.runtime_check` | учитывает цепочку запасных моделей | нет |
| `tools.configure` | запрет писать в MCP-сервер, принадлежащий плагину | нет |
| `profiles.describe` | `enabled` MCP-сервера через `_mcp_entry_enabled` | нет |

## 3. Тихо сменившиеся умолчания конфига — решения

| Ключ | Было → стало | Решение |
|---|---|---|
| **`gateway.multiplex_profiles`** | `false` → `true`; явный `false` **снят с поддержки** (переписывается в `true`) | Касается `cron-runner.ts`: наш `gateway run` при двух и более профилях (специалисты — профили) теперь обслуживает **все профили хоста** — тикает и их расписания — и записывает решение в `config.yaml`. Отказаться нельзя, кроме `gateway.standalone: true` (у них — временная прокладка). Принимаем: расписания специалистов начинают исполняться фоновым процессом, а не только в открытом чате (связано с D-140/D-141). Проверка — `cron-gateway-tick-probe` и блок 37 |
| **`vault.bitwarden.enabled`, `vault.onepassword.enabled`** | `false` → `true` (найденный на PATH `bw`/`op` сразу становится источником логинов) | **Закрываем** умолчанием `false` в `applyCoreOptOuts` (как `updates.check` в 3.B5д): сейф логинов — HX24. Секреты в окружение (`secrets.*`) это не включает — там нужен явный `enabled: true` |
| `tools.tool_search.defer` | новый список отложенных инструментов (`drive_preview`, `desktop_preview`, `read_terminal`, …) | принимаем; агент зовёт их через `tool_call` — e2e блока 46 уже так и написан |
| `compression.threshold_tokens` | `null` → `256000` | принимаем |
| `curator.backup.keep` 5 → 2, `curator.prune_builtins` true → false | принимаем |
| `discord.bots_require_inline_mention` | `false` → `true` | принимаем (мессенджеры — их поведение) |
| `local_runtime.tag` | `b10679` → `b10964` | не наш путь (HX локальных моделей не меняется) |
| `_config_version` | 44 → 46 | миграции ядра при старте; `config.yaml` стенда пересобирается — проверить, что наши ключи пережили |

## 4. Появилось — что нас касается

- **`connection.respond` + события `connection.request` / `connection.update`** — новый вопрос
  сервер→клиент «подключить учётную запись/сервер». Замена их `store/mcp-setup.ts`, на котором
  держится наше согласие на установку MCP агентом (`aec/install-consent`). Мост пропускает, согласие
  переводится (3.B6в).
- **`display.*` (8 методов), `/api/display/ws`, `bot_desktop.*`** — Bot Desktop, только Linux; D-145.
- **`connectors.*` учётные записи, каталог, политика** — размещённые коннекторы Nous, HX3.
- **`onboarding.ensure_setup_profile` / `reset_setup_profile`** — их первый запуск, HX26.
- **`session.branch_stored`, `session.branch_whole`, `/api/sessions/{id}/timeline`,
  `…/messages/around`** — ветвление и шкала времени ленты; их код, мост пропускает.
- **`client.capabilities`** — клиент объявляет свои возможности; проверить, что мост пропускает.
- `/api/health/idle`, `/api/health/retirement`, `/api/host/identity`, `/api/chat/workspaces` — их REST;
  наш `gateway-passthrough` — по списку, новые маршруты вносятся, если их зовёт вендорный код.

## 4а. Найдено пробами на установленном ядре (24.09.2026)

- **`client.capabilities {server_requests: true}` обязателен.** WebSocket-клиент, который его не
  прислал, считается сборкой старше протокола вопросов: ядро НЕ шлёт ему ни `clarify`, ни
  подтверждений команд (R21), ни `sudo`, ни секретов, ни `terminal.read`/`preview.read` —
  инструмент сразу получает пустой ответ (`server_requests._unanswerable`, #112548). Дифф контрактов
  этого не показал: метод в списке был, а смысл «без него вопросов нет» — только в коде. Наш главный
  процесс теперь объявляет себя на каждом `gateway.ready` (`shared/gateway/client.ts`, тест в
  `events-parsing.test.ts`); проба `server-requests-probe.mjs` — тоже. Без этого приложение на 0.21.5
  молча теряло бы все вопросы агента человеку.
- **17 инструментов по умолчанию отложены за `tool_search`** (`tools.tool_search.defer`, `enabled:
  auto`): среди них `read_terminal`, `desktop_preview`, `annotate_preview`, `desktop_project`,
  `gui_tour`, `show_tip`, `session_search`, `todo_list`, `cronjob_manage`. Модель видит их только
  после поиска; `gpt-5-mini` стенда сам поиск не начал и ответил «инструмент недоступен». Умолчание
  ядра принимаем (правило объёма); проба просит найти инструмент поиском. Влияние на модельные
  позиции приёмки (терминал, предпросмотр, проекты) покажет 3F.14 — красное там сверяется с этим
  пунктом прежде, чем записываться дефектом.

## 5. Python-зависимости

Новых пакетов нет (`donor-move-0.21.5.md`, таблица). `uv pip list` после установки должен совпасть
с 0.21.3 по составу; `pillow-heif` по-прежнему снят `uv-overrides.txt`.
