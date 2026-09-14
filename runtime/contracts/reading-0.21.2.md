# Чтение дифа контракта 0.21.0 → 0.21.2 (задача 3.B4б)

Разбор `node runtime/contract-diff.mjs runtime/contracts/hermes-0.21.0.json
runtime/contracts/hermes-0.21.2.json`, выполнен 2026-09-14 после установки ядра
0.21.2 (Vibe Diff + «Го» владельца). Правило раздела прежнее: у каждого
расхождения стоит либо решение, либо «нас не касается» с основанием. Пропусков
нет — счёт сходится по каждой из трёх категорий инструмента: **сломалось 7, молча
сменило умолчание 340, появилось 92**.

Обе стороны сняты **одним и тем же инструментом одного формата** (слепок формата 4,
см. раздел 0): сторона 0.21.0 — из рабочего дерева `git worktree` на коммите
`29112bef`, ключом `--core`; сторона 0.21.2 — из `runtime/.hermes-src` на `939e45c9`.
Сравнивать слепок формата 3 со слепком формата 4 было бы сравнением инструментов,
а не ядер.

---

## 0. Инструмент переписан: формат слепка 3 → 4

До этого подъёма `contract-snapshot.mjs` собирал реестр методов шлюза **регулярным
выражением по исходнику** (`@method("x")`). На 0.21.2 это нашло 119 методов из
225: шлюз разнесён из одного `server.py` (~3 250 строк) по 67 модулям, и у
регистрации теперь **пять стилей** — `@method`, `@_rpc(...)`, `@_scoped_rpc(...)`,
`@_session_method(...)`, словарные таблицы `"tools.list": (5031, lambda …)`, плюс
цикл по f-строке `_rpc(f"learning.{_name}", …)`.

Теперь инвентарь — **сам живой реестр**: скрипт импортирует `tui_gateway.server`
во временном `HERMES_HOME`, читает `server._methods`, разворачивает обёртки
(`__wrapped__`, затем замыкание с именем `fn`/`func`/`handler`/`body`/`inner`) до
тела обработчика и хэширует его исходник вместе с внутренними функциями замыкания.
События собираются из `_emit("x")` **и** из `_spawn_side_agent(…, "x", …)`,
маркеры чекпойнтов — из `_PROJECT_MARKERS = {…}` (раньше `markers = {…}`).

**Три ложные находки, которые это сняло** (все были записаны в PLAN, TASKS,
MEMORY и `donor-move-0.21.2.md` по regex-инвентарю и исправлены тем же коммитом,
что и этот документ):

1. «`learning.delete`, `learning.detail`, `learning.edit` исчезли» — **нет**:
   они регистрируются циклом `methods_tools.py:1080-1082`, а ключи `id`/`content`
   читаются кортежем `arg_keys` в `_learning_mutation` (`:1068`). **Все 45 наших
   методов на месте**, экран обучения не ломается.
2. «События `btw.complete`, `background.complete`, `preview.restart.complete`
   пропали» — они теперь идут через `_spawn_side_agent`; **все 42 события 0.21.0
   на месте**, одно добавилось (раздел 3.4).
3. «Маркеры чекпойнтов исчезли» — переименована переменная; **9 из 9** на месте.

Счёт формата 4 на обеих сторонах: 0.21.0 — 199 методов в 36 модулях, 246
маршрутов, 826 умолчаний конфига, 42 события, 9 маркеров; 0.21.2 — **225 методов
в 67 модулях, 263 маршрута, 867 умолчаний, 43 события, 9 маркеров**; наших 45
методов и 12 REST-маршрутов — все присутствуют на обеих сторонах.

---

## 1. «Сломалось» — 7 из 7

### 1.1. Два маршрута — статика их дашборда

`GET /{full_path:path}` и `GET /assets/{filename}.css` ушли из `web_server.py`.
Они не удалены, а переехали в новый `hermes_cli/web_server_dashboard.py`: бандл
дашборда теперь монтируется `StaticFiles`, а запасной маршрут `no_frontend`
регистрируется внутри функции (`:112`), куда инвентарь маршрутов не смотрит.

**Нас не касается.** Это SPA их веб-дашборда; мы ходим в `/api/ws` и в двенадцать
REST-маршрутов, и все двенадцать на месте.

### 1.2. Пять ключей конфига

| Ключ | Было | Куда делся | В нашем `config.yaml` |
|---|---|---|---|
| `auxiliary.compression.max_output_tokens` | 0 | фабрика `_aux()` больше не выдаёт ключ — снята «guarded fast lane» сжатия | нет |
| `cron.model_drift_guard` | true | снят миграцией 42: незакреплённые cron-задачи бегут на модели, под которой созданы, а не падают при смене глобальной | нет |
| `model_catalog.ttl_hours` | 1 | переименован в `ttl_minutes` = 20 (миграция 40) | нет |
| `moa.presets.default.max_tokens` | 4096 | пресеты MoA перестроены | нет |
| `sessions.write_json_snapshots` | false | JSON-снимки сессий удалены совсем (`state.db` каноничен) | нет |

**Нас не касается ни один:** ни один из пяти в `runtime/dev-profile/config.yaml`
не стоит, и никакой наш код их не пишет (проверено `grep` по `runtime/*.mjs` и
`apps/desktop/src/main`).

---

## 2. «Молча сменило умолчание» — 340 из 340

Состав: **199 методов** (изменилось тело у каждого, кто есть на обеих сторонах —
включая все 45 наших), **139 маршрутов** переехали по файлам, **2 значения
конфига**. Первые два числа — цена разнесения `server.py` по модулям и
`web_server.py` по `web_routers/*`: тела двигались, хэши сменились у всех разом.
Поэтому читать «тело изменилось» по одному методу бессмысленно, и проверялось
другое — **контракт параметров**.

### 2.1. Наши 45 методов — контракт параметров цел

Метод проверки: для каждого нашего метода на обеих ревизиях собраны все ключи
`params`, которые читает обработчик **и все, кому он передаёт `params`** (функции
и классы внутри `tui_gateway`, до четырёх уровней), с их умолчаниями; затем
сравнены с тем, что шлёт наш `main/index.ts` (`sent-params.json`, 45 методов).

**Ни один ключ, который мы шлём, не перестал читаться.** Расхождений без шума 16,
и они делятся так:

- **Шум обёрток, вычтен.** Старая обёртка читала `text` у всех методов (ушло);
  новые обёртки читают `subagent_id` у 36 методов, `session_id` у 13 и `profile`
  у 18 — это `_scoped_rpc`/`_profile_scoped_rpc` (`methods_tools.py:19`): при
  переданном `profile` вызов исполняется в HERMES_HOME этого профиля (4064, если
  каталога нет). **Мы `profile` ни одному из этих 18 не шлём**, поэтому они
  работают на профиле по умолчанию — ровно как раньше. `session.create` и
  `session.resume`, которым мы `profile` шлём, остались обычными `@method`
  (`methods_session.py:325`, `:825`) — там `profile` значит профиль сессии,
  как и было.
- **Пять методов, где ключ, который мы шлём, «исчез» для статики** — на деле
  читается динамически, проверено глазами:

| Метод | Ключи | Где читаются на 0.21.2 |
|---|---|---|
| `config.set` | `confirm_expensive_model` | `methods_config_set.py:111`, через таблицу `_CONFIG_SETTERS` |
| `learning.delete` / `.detail` / `.edit` | `id`, `content` | кортеж `arg_keys` в `_learning_mutation`, `methods_tools.py:1068-1082` |
| `plugins.manage` | `action`, `name`, `enable` | `_run_action(rid, params, _PLUGINS_ACTIONS, …)` → `_plugins_toggle`, `methods_tools.py:1365-1369` |

- **Умолчания, ставшие «пусто» вместо `False`/`""`** (`session.create`
  `hidden`/`room_plumbing`/`follow_profile_config`/`close_on_disconnect`,
  `session.list` `include_hidden`, `session.resume` `lazy`/`defer_history`/
  `omit_messages`/`eager_build`, `session.compress` `focus_topic`, `session.steer`
  `text`, `session_id` у восьми): это переход на помощники `_flag(params, name)`
  (= `is_truthy_value(params.get(name, False))`) и `_str_param(params, key,
  default="")` (`methods_session.py:48-62`). Значение при отсутствии ключа то же.
- **Ключи, которые больше не читаются и которые мы не шлём:** `config.get` —
  `cwd`; `config.set` — `scope`; `session.resume` — `close_on_disconnect`;
  `plugins.manage` — `force`, `identifier`, `key`, `repo` ушли в таблицу действий.

Проверено отдельно, по телам: `process.kill` (`process_id` обязателен, отказ
4012), `rollback.diff` (`hash`, 4014), `rollback.restore` (`hash`, `file_path`,
проверка занятости 4009), `reload.mcp` (`confirm`, `rev`, `session_id`),
`tools.configure` → `_configure_session_tools(rid, params, sid, session)`.

### 2.2. Два сменившихся значения конфига

| Ключ | Было | Стало | Решение |
|---|---|---|---|
| `_config_version` | 39 | **42** | нас не трогает; см. ниже |
| `sessions.auto_prune` | false | **true** | при нашем запуске не исполняется; вопрос владельцу — закрепить `false` в нашем `config.yaml`? |

**`_config_version` 39 → 42** — три шага миграции (`hermes_cli/config_migrations.py`):
40 — `model_catalog.ttl_hours: 1` → `ttl_minutes: 20`; 41 — вырезать из `SOUL.md`
каждого профиля устаревший раздел `## Messaging other agents` (сервер теперь
подставляет живой ростер в Bot Chat); 42 — удалить `cron.model_drift_guard`.
Миграции запускаются только `hermes setup`/`update`/`doctor` и при создании
профиля (`profiles.py:383`) — **не при `hermes serve`**. Наш dev-профиль стоит
на `_config_version: 32` (как и было замечено при 0.21.0) и пережил пятый подъём
без миграций. Заголовка `## Messaging other agents` ни в одном нашем `SOUL.md`
нет, а `prompt_builder.py:1473` вырезает его и на лету.

**`sessions.auto_prune` false → true** — это ответ на #54189 («state.db растёт
до гигабайт за недели»): раз в `min_interval_hours` (24) при старте удалять
**завершённые** сессии без активности `retention_days` (90) и делать VACUUM.
Открытые, закреплённые и идущие сессии не трогаются; осиротевшие сессии
автоматики (cron/kanban/субагенты) сначала закрываются и получают своё окно.

**При нашем запуске это не исполняется.** Вызов один — `_run_state_db_auto_maintenance`
(`cli.py:1103-1120`), и зовут его только интерактивный `HermesCLI._init_session_store`
(`cli.py:2862`) и мессенджерный `GatewayRunner._init_session_db` (`gateway/run.py:3604`).
Мы поднимаем ядро как `hermes serve` (`runtime/serve.mjs:100`), это `tui_gateway`
в процессе, и в `tui_gateway/**` ни `auto_prune`, ни `maybe_auto_prune` нет.
Исполнится оно, только если владелец запустит интерактивный `hermes` с нашим
`HERMES_HOME`. Продукт обещает историю (SPEC UR4), их `doctor` подталкивает
включать, а строка в нашем `config.yaml` стоит ноль — потому вопрос вынесен на
интервью с рекомендацией закрепить `sessions.auto_prune: false`.

### 2.3. 139 маршрутов переехали по файлам

`web_server.py` → `web_routers/{ops,sessions,skills,audio,dashboard_ui,…}.py`.
Метод и путь у всех 139 те же; наши 12 (`/api/audio/speak-stream`, `/api/curator`,
`/api/env`, `/api/learning/graph`, `/api/mcp/servers`, `/api/memory`,
`/api/profiles`, `/api/profiles/active`, `/api/sessions`, `/api/skills`,
`/api/skills/toggle`, `/api/status`) — на месте. **Нас не касается.**

### 2.4. События и маркеры — без потерь

42 события 0.21.0 излучаются и на 0.21.2, в том числе `btw.complete`,
`background.complete`, `preview.restart.complete` (теперь через
`_spawn_side_agent`); наши слушатели — `aec/btw/btw-pure.ts`,
`donor/app/session/hooks/use-preview-routing.ts`. Девять маркеров чекпойнтов
(`tools/checkpoint_manager.py:61`, `_PROJECT_MARKERS`) те же.

---

## 3. «Появилось» — 92 из 92

### 3.1. Двадцать шесть методов шлюза

| Семейство | Методы | Что это | Нас касается? |
|---|---|---|---|
| `vault.*` | `add`, `list`, `lock`, `unlock`, `remove`, `sources`, `source.set` + `vault.code.respond`, `vault.save_login.respond`, `vault.unlock.respond` (10) | хранилище логинов, карт и адресов для агента в браузере; 1Password/Bitwarden как источники | **новая поверхность, вопрос владельцу** (3.B4г); рекомендация — не брать: секреты и платежи вне продукта |
| `free_tier.*` | `status`, `provision`, `ack_notice` (3) | бесплатный тариф Nous + анонимный вход (`hermes_cli/anon_auth.py`) | не берём: их облако, класс правки [4] |
| `connectors.*` | `list`, `connect` (2) | коннекторы через Nous tool gateway, требуют входа в их портал | не берём: их облако |
| `session.control`, `session.control.read` | (2) + событие `session.control.update` | структурные кнопки десктопа для цели, цикла и heartbeat сессии | **вопрос владельцу** (3.B4г, «session-control») |
| `session.foreign.*` | `list`, `preview`, `import` (3) | импорт истории из Claude Code (`~/.claude/projects/*.jsonl`) и Codex CLI (`~/.codex/sessions`) | **вопрос владельцу** (3.B4г, «импорт сессий») |
| `subagent.list`, `subagent.tail` | (2) | список и хвост вывода субагентов сессии, только владельцу транспорта | **вопрос владельцу** — их клиент этим кормит экран субагентов (блок 49) |
| `gateway.capabilities` | (1) | что принуждает ЭТА сборка (`per_session_exclusive_submit`); клиент без объявления не полагается | берём вместе с их клиентом, если он это читает — решится переносом |
| `mcp.servers.oauth.cancel`, `mcp.servers.status` | (2) | пара к `oauth.start`/`callback` из 0.21.0 | не зовём; придём позже вместе с их экраном MCP |
| `profiles.remember_onboarding` | (1) | запоминание ответов онбординг-чата | вопрос владельцу — вместе с «onboarding-chat» (3.B4г) |

### 3.2. Семнадцать REST-маршрутов

- **`/api/local-models/*` (14)** — их «локальный рантайм» (`local_runtime.*`,
  llama.cpp-сборка `tag: b10679`): каталог, поиск, загрузка, установка рантайма,
  запуск сервера, активация. **Вопрос владельцу** (3.B4г, «локальные модели»).
- `GET /api/dashboard/plugins/catalog` — каталог плагинов с пином по SHA
  (вместе с `app/skills/plugins-tab.tsx`, куда переехал `plugins-settings.tsx`
  с нашими правками) — **вопрос владельцу**.
- `GET /api/skills/hub/official` — официальные наборы хаба скиллов; берётся,
  если их экран скиллов его зовёт — решится переносом.
- `POST /api/audio/tts-lease` — аренда синтеза речи; наш `/api/audio/speak-stream`
  цел, к аренде не привязан — **нас не касается**, пока их клиент не потребует.

### 3.3. Сорок шесть новых ключей конфига

Ни один не стоит в нашем `config.yaml`; все получают значение слиянием умолчаний
при чтении. Рекомендация та же, что владелец принял 2026-09-01: **принять как у
них** — кроме трёх строк, помеченных ниже.

| Группа | Ключи (умолчание) | Оценка |
|---|---|---|
| Агент | `agent.budget_warning_ratio` (null), `agent.fast_auto_seconds` (60), `agent.sanitizer_heal_escalation_threshold` (3), `agent.turn_liveness.poll_s` (15), `agent.turn_liveness.timeout_s` (600) | принять; `turn_liveness` — сторож зависшего хода, безопаснее прежнего |
| Делегирование | `delegation.compression_threshold_tokens` (0), `.fallback_providers` (null), `.independent_completions` (false) | принять; субагенты у нас через их же механизм |
| Шлюз мессенджеров | `gateway.bot_loop_guard.*` (4), `gateway.startup_watchdog` (true), `gateway.startup_watchdog_timeout_seconds` (300), `gateway.trust_env` (true) | не касается: `hermes gateway` мы не поднимаем |
| Локальный рантайм | `local_runtime.backend` ("auto"), `.detect_ports` ([]), `.enabled` (**false**), `.models_max` (4), `.port` (0), `.tag` ("b10679") | выключен умолчанием; зависит от решения по 3.2 |
| Nous / телеметрия / обновления | `nous.anthropic_wire` ("chat"), `nous.guest` (true), `nous.keepalive_interval_seconds` (900), `telemetry.shared_metrics.endpoint` (их URL), `telemetry.shared_metrics.send` (**false**), `updates.check` (true) | `send: false` — хорошо и так оставить; `updates.check` читает только баннер CLI (`banner.py:379`), при `serve` не зовётся; `nous.*` — их облако, не берём |
| Vault | `vault.bitwarden.*` (2), `vault.onepassword.*` (4), всё выключено | зависит от решения по vault |
| Прочее | `computer_use.native_wayland` (false), `context_file_read_timeout` (5), `cron.delivery.notify` (true), `dashboard.ws_orphan_activity_stale_s` (600), `desktop.manage_launcher_entry` (true), `display.bell_on_prompt` (false), `display.resume_last_session` (true), `model_catalog.ttl_minutes` (20), `plugins.allow_deprecated_imports` (false), `skills.create_dir` (""), `terminal.docker_snap_compat` (false), `tool_loop_guardrails.non_interactive_hard_stop_enabled` (true), `tools.connectors.enabled` (true) | принять; `tools.connectors.enabled` без входа в портал Nous инструмента не даёт — реестр инструментов сверить после переноса (`tool-registry.mjs`) |

Три строки, где принять «как у них» — не автоматически: `local_runtime.*`,
`vault.*`, `tools.connectors.enabled` — их судьба следует за решениями по
поверхностям в 3.1–3.2.

### 3.4. Одно событие шлюза

`session.control.update` — излучается после успешного `session.control`. Без их
экрана управления сессией слушать нечего; решится вместе с 3.1.

### 3.5. Зависимости

Python в venv ядра: **37 → 37 пакетов**, поднят только `nemo-relay` 0.7.3 → 0.8.4
(их релей исходящего трафика, `gateway/relay/egress.py`; при `serve` не
поднимается). `mem0ai` 2.0.10, `qdrant-client` 1.19.0, `openai` 2.24.0 — те же.
Ровно как предсказано в Vibe Diff. У донора одна новая npm-зависимость —
`qrcode@1.5.4`, нужна только экрану QR-входа Telegram; берётся лишь вместе с ним
и только через `dependency-vetting`.

---

## 4. Плагин памяти Mem0 переписан — что проверено

`plugins/memory/mem0/` −4 404/+2 117 строк: `__init__.py` ужат, добавлены
`_backend.py` (три бэкенда: платформа, свой сервер, OSS) и `_openai_llm.py`.
Всё, на что опираемся мы, сверено с новым текстом:

- **Форма `mem0.json` та же:** `mode: "oss"`, `oss.llm.{provider,config}`,
  `oss.embedder.{provider,config}`, `oss.vector_store.config.path` — читаются
  `OSSBackend.__init__` (`_backend.py:117-153`). Наши ключи `openai_base_url`,
  `is_reasoning_model`, `embedding_dims`, `model`, `path` — все в ходу
  (`_oss_providers.py:9,14,19`, `_backend.py:135-142`).
- **Новое: для `llm.provider: openai` они подменяют класс LLM на свой
  `DirectOpenAILLM`** (`_openai_llm.py`), который обходит `OpenAILLM.__init__`
  из mem0 — тот выбирал OpenRouter, если стоит `OPENROUTER_API_KEY`. Ключ берётся
  из `OPENAI_API_KEY`, адрес — из нашего `openai_base_url` (`:40-44`). Для нас это
  то же поведение, что и было, и более предсказуемое.
- **`user_id`: наш приоритетнее** — «operator-configured (env/mem0.json) >
  gateway-native > `hermes-user`» (`__init__.py:218-221`); мы пишем ключ проекта,
  а не плейсхолдер, значит разделение памяти по проектам (задача 5.2) держится.
- **`load_memory_provider("mem0", register_skills=False)`**, `provider._backend._memory`
  (`Memory` из mem0), `provider._user_id`, метаданные записи `{"channel": …}` —
  всё, что читает `runtime/memory-facts.py`, на месте (`__init__.py:237-239`).
- **ABC `agent/memory_provider.py`** — один новый метод `identity_signature()`,
  остальные 20 те же по именам и сигнатурам.

**Одна настоящая перемена поведения:** `sync_turn` теперь **обрезает каждое
сообщение хода до 450 символов** по последней границе предложения перед отправкой
на извлечение фактов (`_SYNC_MSG_MAX_CHARS = 450`, `__init__.py:43-56`, `:298-299`).
Порог подобран под 512-токенные локальные эмбеддеры (bge-small); наш
`text-embedding-3-small` держит 8 191 токен, а извлекает факты `gpt-5-mini`.
Для нас это чистая потеря: факт, сказанный в конце длинного сообщения, до памяти
не дойдёт. Порог поднимается ключом `sync_max_chars` в `mem0.json`
(`__init__.py:226`) — то есть одной строкой в `buildMem0Json`. **Вопрос владельцу**
на интервью, рекомендация — поставить. Проба `memory-autowrite-probe.mjs` этого не
поймает: её факт короче порога; после решения пробу стоит дополнить фактом в хвосте
длинного сообщения.

Пять проб памяти (`memory-*-probe.mjs`) обязательны после переноса — на новом
ядре они ещё не запускались.

---

## 5. Что проверено на живом ядре, а не выведено

- `hermes --version` = `Hermes Agent v0.21.2 (2026.9.11) · local 939e45c9`,
  установка git, каталог `runtime/.hermes-src` на `939e45c91d` («chore: release
  v0.21.2 (2026.9.11)»).
- `uv pip list` в venv ядра: `hermes-agent 0.21.2` (editable), `nemo-relay 0.8.4`,
  `mem0ai 2.0.10`, `qdrant-client 1.19.0`, `openai 2.24.0`.
- Слепок 0.21.2 снят с живого реестра (`server._methods`) — 225 методов в 67
  модулях, 263 маршрута, 867 умолчаний, 43 события, 9 маркеров; наших 45 методов
  и 12 маршрутов — все присутствуют.
- Контракт параметров 45 методов — с живых объектов обеих ревизий
  (`inspect.getsource` по цепочке вызовов), не по тексту файлов.
- `sessions.auto_prune`: путь вызова прочитан до `spawn` в `serve.mjs`.
- Плагин Mem0: ключи и приоритеты — по новому тексту, раздел 4. **Пробы на новом
  ядре не запускались** — это шаг после переноса.
- Три реестра паритета (`parity-registry.mjs`, `tool-registry.mjs`,
  `platform-registry.mjs`) на новом ядре **ещё не запускались** — они меряют
  перенесённый рендерер, а он пока на 0.21.0.

### Замечено попутно

- `hermes --version` печатает «upstream 14efb460 · (+1 carried commit)»: их
  определитель версии считает коммит релиза «переносным» поверх апстрима, потому
  что дерево получено `git fetch --depth 1`. На работу не влияет.
- Профиль по-прежнему на `_config_version: 32` — см. 2.2; расхождение старое.

---

## 6. Развилка AGENTS §9 — эвал или отказ, решает владелец

Изменение ИИ-поведения ядра в этом релизе есть, и большое:
`agent/prompt_builder.py` −3 143/+1 706 строк вместе с `agent/system_prompt.py`,
`agent/side_question.py` (±310), `agent/plan_prompt.py` (±56),
`hermes_cli/default_soul.py` (−87/+47). По знаку это уборка (удалений вдвое
больше), но семантика промпта нигде не гарантирована прежней.

Основание для отказа то же, что записано 2026-09-01 в `reading-0.21.0.md` §6:
блок собирает их ядро; наш `eval/runner/run.py` меряет модель напрямую, минуя
шлюз, и поведение агента через живое ядро измерить не может. **Решение на
интервью**: (A) эвал не строим, отказ записывается здесь на ответственность
владельца, или (B) владелец называет инструмент, которым это мерить.
