# Разбор контракта ядра 0.22.2 → 0.23.0 (задача T51)

Слепок `hermes-0.23.0.json` снят 2026-11-07 с реестра установленного дерева `2bd378ed`
(`node runtime/contract-snapshot.mjs`, формат 4): методов 261 в 100 модулях (было 257 в 88),
маршрутов 316 (было 282), событий 47 (было 46), дефолтов конфига 962 (было 939), наша
поверхность — 40 методов и 14 маршрутов. Сравнение — `node runtime/contract-diff.mjs`:
сломалось 25, появилось 96, молча сменило 117 (54 метода с изменившимся телом, 2 умолчания
конфига, 61 зависимость). Тела методов сверены по `git show d923a5eb:/2bd378ed:` в
`runtime/.hermes-src`.

## 1. Сломалось — 25, нас не касается ни одно

| Что | Почему не касается |
|---|---|
| сняты `browser.controller.detach/heartbeat/register/result` (4) | управление браузером через расширение ушло вместе с узкими `browser_*`; среди наших 40 методов их нет |
| сняты `browser.backend`, `snapshot_threshold`, `record_sessions`, `allow_unsafe_evaluate`, `restrict_evaluate`, `extension_control.*`, `camofox.*` (13) | наш `applyBrowserBackend` пишет только `browser.cloud_provider: local` — ключ в 0.23 жив (`tools/browser_use_cli.py`); `browser_exec` через `browser-harness` — единственный браузер. Миграция конфига v52 (`hermes_cli/config_migrations_browser.py`) сама удаляет `browser.backend` (для `off` — разовое уведомление) и `extension_control`: профиль, где стоит наше прежнее `backend: off` (3E.3), после старта 0.23 получает `browser_exec` |
| снят `auxiliary.skills_hub.*` (7) | вспомогательная модель поиска навыков; мы её не пишем и не читаем |
| снят `terminal.singularity_image` | контейнерный терминал — не наш путь, терминал локальный |

## 2. Наши методы с изменившимся телом — 9

| Метод | Что изменилось | Нас касается? |
|---|---|---|
| `commands.catalog` | сборка вынесена в `tui_gateway/command_discovery.py::command_catalog`; область профиля та же; в ответе новые поля `plugin_discovery_error` и `plugin_commands`; быстрые команды читаются `load_config_readonly` | нет — новые поля мы не читаем (поиск по `main`, `shared`, `aec`) |
| `complete.slash` | тело переехало в `command_discovery.py::slash_completions` без смены логики и полей | нет |
| `complete.path` | список вынесен в `_path_completion_items`; меняется только ветка нелокального терминала (cwd клиента у песочницы игнорируется, запасное `"."`) | нет — терминал локальный |
| `config.set` | отказ слоя конфига (`ConfigWriteError`: ключ закрыт верхним уровнем — удалённой конфигурацией флота) теперь 4002 с текстом, ничего не записано | нет — верхних уровней у нас нет (HX35); ошибка доходит до окна, как прежде |
| `plugins.manage` | новые действия: `inspect`, `install_desktop`, `remove_desktop`, `update_all`, `auto_update` (читает или с `enable` ставит `plugins.auto_apply`) | **да**: наш main зовёт только `list` и `toggle`, но мост пропускает метод целиком (`DENIED_RPC_METHODS` — только `model.save_key`), а вкладка плагинов донора 0.23 (`plugins-tab.tsx` → `plugin-update-all.tsx`, `Edits: none`) показывает «Обновить все» и переключатель автообновления. Один щелчок ставит `plugins.auto_apply: true` поверх нашего умолчания и тянет код из сети мимо гейта доверия (решение 0012, п. 6); `install_desktop` — плагины окна (HX5). Закрыть в мосту — §5 |
| `prompt.submit` | отказ слота с записью в журнале шлюза (`ledger_status`) больше не 4090 сразу: сообщение уходит в очередь сеанса у шлюза-владельца (`owner_forward`), ответ `{status: "queued", admission_id, forwarded: true}`; иначе 4090 с причинами `SESSION_NOT_OWNED`, `SESSION_OWNER_BUSY`, `SESSION_OWNER_UNCONFIRMED`; внутренние `_hosted_images` для комнат; стоп-фраза голоса — по сеансу | **да, проверить**: срабатывает, только когда у шлюза `gateway run` (наши расписания) есть работа для этого сеанса. `status: 'queued'` наш тип уже знает; тексты причин английские и доходят до окна как есть. Прогнать ход при включённых расписаниях в e2e T52/T53 |
| `rollback.restore` | полный откат теперь «бережный» (`safe=True`, если не передан `all: true`): файлы, которые человек правил после последней записи агента, **не трогаются** (`skipped_user_edits`), а созданные агентом после снимка — **удаляются** (`failed_deletes`, если не вышло); слишком большие — оставляются (`skipped_oversize`); если всё изменённое правил человек — `success: true` с `reason: "nothing to restore…"`. Без журнала записей агента — прежний полный откат. Новый параметр `all` (не булево — 4001) | **да**: тексты окна отката врут в обе стороны — `confirmAll` обещает «текущее содержимое пропадёт» (правки человека теперь сохраняются), `confirmNote` — «созданные после снимка не удаляются» (созданные агентом теперь удаляются), а «Снимок восстановлен.» показывается и тогда, когда не восстановлено ничего. Мы `all` не шлём — и рекомендуем не слать: бережный откат защищает правки инженера. Правки — §5 |
| `session.usage` | блок `account_lines` (окна квот провайдера, например Codex) из ответа убран; кредиты Nous — через `nous_credits_usage_fields`, новое поле `credits_usage_window` | нет — `account_lines` мы не читали; донор читает только `credits_lines` |
| `setup.runtime_check` | к «No usable credentials found for …» добавляется подсказка профиля провайдера (`missing_credentials_suffix`); при исключении ответ `readiness_failure`: для недоступного локального сервера модели — `error_code` | **да, в пользу**: наш `setup:runtime-check` отдаёт ответ как есть, `runtime-readiness.ts` донора по `error_code` оставляет окно открытым с ошибкой вместо возврата ко входу провайдера. В `RuntimeCheckResult` (`shared/gateway/types.ts`) поля нет — дописать для документации |

Строка 160 диффа — «умолчание `enabled=True` исчезло» у `browser.manage`: действие `use`
(переключение режима Browser Use CLI) снято вместе с выбором браузера, `status` больше не
отдаёт `browser_use`. Метод зовёт только `slash.ts` донора (перенос на новый `DONOR_SHA` — T52);
наш main его не вызывает — **нет**.

## 3. Тихо сменившиеся и новые умолчания конфига — решения

Сменилось 2, новых 44.

| Ключ | Было → стало | Решение |
|---|---|---|
| `sessions.auto_prune` | `true` → `false` | уже закреплено `false` (`applyCoreOptOuts`, 3.B4д); ядро пришло к нашему значению, строку оставляем — урок `vault.*.enabled` |
| `_config_version` | 50 → 52 | миграции при старте; v52 убирает `browser.backend` и `browser.extension_control` (§1); наши ключи после старта — проверка T51 |
| `agent.daybreak` | `false` | закреплено в `CORE_OPT_OUTS` (HX35) |
| `webapp.enabled` (+ `host` `127.0.0.1`, `port` 9120, `public_url`) | `false` | закреплено в `CORE_OPT_OUTS` (HX33); адрес и порт при выключенном не действуют. Но `POST /api/webapp-access/start` сам пишет конфиг и перезапускает шлюз — мост REST его пропускает (§5) |
| `dashboard.session_token_auth.enabled` | `true` | принимаем: на этом плагине держится наш токен `HERMES_DASHBOARD_SESSION_TOKEN` (`serve.mjs`, `ssh-pure.ts`) |
| `gateway.unmanaged_idle_exit_seconds` | `600` | принимаем: действует только на шлюз, запущенный клиентом с `--idle-exit` (`gateway/run_idle_exit.py`); наш `cron-runner.ts` запускает `gateway run` без флага |
| `gateway.service_install_choice` | `null` | принимаем: по их же комментарию обычный запуск службу не ставит |
| `sessions.orphan_end_grace_s` | `300` | принимаем; сеанс без зрителя через 5 мин после хода завершается (возобновляемо) и запускает конец сеанса у памяти (Mem0). Проверить в e2e T52, что переключение проектов и сеансов возобновляет их без потерь |
| `vault.key_storage` | `file` | принимаем; сейф — HX24, менеджеры паролей закрыты `vault.*.enabled: false` |
| `browser.executable_path`, `user_data_dir`, `chromium_args`, `camofox` | пусто | принимаем: пустой `user_data_dir` — свежий профиль на сеанс (логины человека не попадают к агенту); пустой `executable_path` — Chromium из `hermes pm` (`agent-browser` их менеджер заменил на `chromium`, T50) — его наличие в поставке — состав T63 |
| `delegation.backend` `default`, `backends` `{}`, `gateway_mode` `auto`, `prefix_stagger_seconds` `0` | новые | принимаем; маршруты задаёт `advanced-delegation` (T54) |
| `auxiliary.group_router.*` (7) | `provider: auto`, таймаут 20 | принимаем: автовыбор отвечающего в группе зовёт вспомогательную модель (платно, у основного провайдера) — учесть в T53 |
| `hosted_rooms.discussion.max_rounds` 3, `max_messages` 10 | новые | принимаем: ограничивают цену обсуждения в комнате (T53) |
| `worktrees.*` (5) | архив и чистка простаивающих деревьев | принимаем: трогает только `hermes-*`, `subagent-*` и именованные деревья ядра, не папки проекта |
| `vision.replay_recent_images` | `3` | принимаем: последние картинки человека повторяются в восстановленном ходе — чертёж не теряется ценой токенов |
| `compression.prepare_ahead` `false`, `agent.stream_max_lifetime` `0`, `terminal.process_wait_auto_notify` `true`, `terminal.client_env_passthrough` `[]` | новые | принимаем |

Не касаются — 7: `approvals.discord_prompt_timeout`, `gateway.bot_loop_guard.*` (2),
`telegram.extra.dm_topic_auto_transfer` (мессенджеры), `display.cli_layout`,
`display.inline_images` (их CLI/TUI), `runtime.malloc_arena_max` (glibc, Linux).

Ключей событий MCP через вебхуки (HX34) и самоустановки выделенных плагинов среди новых
умолчаний `DEFAULT_CONFIG` нет — их закрытие в T51 искать по коду, а не по этому диффу.

## 4. Появилось — что нас касается

- **`groups.context/continue/discard`, `groups.attachment.*`, `subagent.roster`** — групповые
  чаты на логике ядра (T53) и субагенты; мост пропускает.
- **событие `tool.progress`** — живой прогресс инструментов MCP (T55).
- **`/api/delegation/*`** — маршруты субагентов (T54).
- **`/api/webapp-access/*`, `/api/webapp/*`, `/webapp/*`, WebSocket `/api/host-terminal`** —
  веб-приложение шлюза, HX33; `start` и `restart` пишут конфиг — закрыть в мосту (§5).
- **`PUT /api/dashboard/plugins/auto-update`, `POST /api/dashboard/agent-plugins/update-all`** —
  тот же обход гейта, что `plugins.manage update_all/auto_update` (§2).
- **`/api/desktop-plugins/*`, `/dashboard-plugins/@…`** — плагины окна, HX5.
- **`billing.keep_going_on_credits`, `/api/providers/oauth/nous/handoff`, `/api/messaging/relay/*`**
  — облако и ретранслятор Nous, HX3.
- **`image.render`, `/api/chat/file-upload`, `/api/files/ticket`, `/api/sessions/{id}/mutation-snapshot`,
  `/api/ui-preferences`, `/api/skills/lock`, `/api/cron/jobs/{id}/cancel`** — их код для окна
  донора; мост пропускает по общему правилу (T52).
- **Зависимости**: extras `documents` и `documents-pdf` (python-docx, openpyxl, python-pptx,
  reportlab, pypdf, pdfplumber, pypdfium2) мы не ставим (`setup.mjs` — только `mcp` и `ddgs`).
  Навык `microsoft-office` (слил `docx`, `xlsx`, `powerpoint`, у нас включён) при первом вызове
  строит окружение `hermes pm environment documents …`, а без `hermes` — `pip install` с PyPI в
  `~/.cache/hermes-docs-venv`: загрузка в момент вызова, мимо веттинга, офлайн не работает.
  `keyring` (extra `keychain`) — сейф, HX24. Остальные 61 — смена версий по их `uv.lock`
  (ограничения T20.1); `websockets` в диффе «ушёл в google-meet» — артефакт сравнения
  дубликатов: в основных зависимостях он остался (`pyproject.toml`, строка 136).

## 5. Что сделать

1. `apps/desktop/src/main/gateway-passthrough-pure.ts` (+ тест): закрыть в мосту
   `plugins.manage` с `action` `update_all`, `install_desktop`, `remove_desktop` и `auto_update`
   с `enable` (чтение состояния оставить), `PUT /api/dashboard/plugins/auto-update`,
   `POST /api/dashboard/agent-plugins/update-all`, `POST /api/desktop-plugins/reconcile`,
   `POST /api/webapp-access/start` и `/restart` — иначе умолчания `CORE_OPT_OUTS` снимает
   один щелчок во вкладке донора (решение 0012 п. 6, HX5, HX33). Где кнопка донора от отказа
   ломается — сверить в T52.
2. `apps/desktop/src/renderer/src/shared/i18n/aec-catalog.ts` (`rollback.confirmAll`,
   `confirmNote`, `restoredAll`, обе локали) и `aec/rollback/RollbackPanel.tsx`: тексты под
   бережный откат; показать `skipped_user_edits` и `failed_deletes`, а `reason`
   «nothing to restore» — не как успех. `shared/gateway/types.ts::RollbackRestoreResult` —
   поля `restored_files`, `skipped_user_edits`, `skipped_oversize`, `failed_deletes`; `all` не слать.
3. `apps/desktop/src/shared/gateway/types.ts::RuntimeCheckResult` — `error_code?: string`.
4. `apps/desktop/src/main/index.ts`, комментарий `applyBrowserBackend`: абзац «старый ключ в
   существующем конфиге мы не удаляем… набор будет прежним» устарел — миграция v52 ядра сама
   снимает `browser.backend`.
5. e2e T52/T53: ход при включённых расписаниях (`prompt.submit` с очередью у шлюза-владельца)
   и возобновление сеанса после `sessions.orphan_end_grace_s`.
6. Вопрос владельцу (состав T63): ставить ли extras `documents` и `documents-pdf` в venv ядра,
   чтобы `microsoft-office` не качал пакеты с PyPI в момент первого вызова.
