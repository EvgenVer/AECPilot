# Разбор контракта ядра 0.21.5 → 0.22.2 (задача T20.4)

Слепок `hermes-0.22.2.json` снят 2026-10-15 с живого реестра установленного дерева `d923a5eb`
(`node runtime/contract-snapshot.mjs`, формат 4): методов 257 в 88 модулях (было 237 в 78),
маршрутов 282 (было 275), дефолтов конфига 939 (было 921), наша поверхность — 40 методов и
12 маршрутов. Сравнение — `node runtime/contract-diff.mjs`: сломалось 23, появилось 76,
молча сменило 115. Снимок упал на URL-зависимости (`kittentts @ https://…`, впервые в 0.22.0):
`packaging` требует пробел перед `;` — `contract-snapshot.mjs` склеивает маркер через ` ; `.

## 1. Сломалось — 23, нас не касается ни одно

| Что | Почему не касается |
|---|---|
| сняты методы `onboarding.ensure_setup_profile`, `onboarding.reset_setup_profile`, `profiles.remember_onboarding` | среди наших 40 их нет; их первый запуск — HX26 |
| снят `security.tirith_*` (4 ключа) — сканер команд Tirith ушёл из ядра | мы их не пишем и не читаем; подтверждение команд (R21) — `approvals`, не Tirith |
| снят `plugins.allow_deprecated_imports` | вместо отказа — предупреждение валидатора `plugin_validate_private_imports` (только при `hermes plugins validate`); наш фильтр импортирует `agent.secret_scope`, `agent.memory_manager`, `agent.secret_sources.base`, `hermes_constants` — все в их публичном списке; `plugins.memory`, `tui_gateway.launch_profile_policy` — нет, держатся пробами (T20.9) |
| `local_runtime.tag`, `wake_word.openwakeword.*` | не наш путь (голос — HX19) |
| зависимости: снят `pyyaml`, extra `mem0`, `honcho`, `supermemory`, `wake`, `dev` | `mem0` теперь плагин (T20.3); остальные extras мы не ставим |

## 2. Наши методы с изменившимся телом — 16

| Метод | Что изменилось | Нас касается? |
|---|---|---|
| `command.dispatch`, `commands.catalog`, `complete.slash`, `skills.reload` | обход в области профиля теперь и для черновика без сессии (`params.profile`, #124651); быстрые команды и команды плагинов тоже в области сессии; `get_interactive_skill_commands` | нет — мы шлём `session_id`; навыки проекта (UR29) видны как раньше, проба `skill-priority-probe` |
| `model.options` | гейт `_model_skew_err`: если код на диске сменился после старта процесса (git-установка), отказ 5098 | **да, в пользу**: после `setup.mjs` при живом ядре выбор модели отказывает, пока ядро не перезапущено — правильно; в обычной работе не срабатывает |
| `prompt.submit` | `voice_turn`; переоткрытие завершённой сессии перед изолированным ходом | нет |
| `rollback.list` | поле `message` берётся из `reason` чекпойнта (раньше всегда пустое) | **да, в пользу** — подписи чекпойнтов в окне отката появятся |
| `rollback.restore`, `session.undo`, `session.compress` | текст «session busy» учитывает ручное сжатие; сжатие — через `_manual_compress_turn` | нет |
| `session.delete` | удаление через `agent.onboarding_record.delete_chat`; живая сессия — 4023 | нет — наш тип уже описывает 4023 (`shared/gateway/types.ts`) |
| `session.history` | история по ключу строки, в которую пишет живой агент (после ротации сжатия, #123545) | **да, в пользу** — переподключение после сжатия больше не теряет ходы |
| `session.list` | делегированные запуски включаются по `sessions.show_subagents` (по умолчанию нет) | нет — как раньше |
| `session.resume` | восстанавливает YOLO сессии; рабочая папка сохранённой сессии проверяется (`_resumable_stored_cwd`) | нет; e2e смены проекта — T20.10 |
| `session.steer` | переехал в `methods_session_interrupt.py` | нет |
| `setup.runtime_check` | поле ответа `free_tier` → `free_tier_route`; ошибка называет закреплённого провайдера, а не хвост цепочки | нет — `free_tier` мы не читаем (поиск по `main`, `shared`, `aec`) |
| `tools.configure` | во время хода — отказ 4009 «session busy» | **да**: переключение набора инструментов во время ответа агента отклоняется; ошибка доходит до окна как отказ — сверить при прогоне e2e вкладки инструментов (T20.10) |

## 3. Тихо сменившиеся и новые умолчания конфига — решения

| Ключ | Было → стало | Решение |
|---|---|---|
| `tools.tool_search.defer` | + `browser_vault`, `manage_catalog`, `set_theme`, − `apply_layout` | **принимаем**, наш `CORE_DEFERRED_TOOLS` синхронизировать и обновить в существующих профилях, где стоит наш прежний список (T20.5) |
| **`plugins.auto_update_check_hours`** (новый) | `24` — шлюз (`gateway/run.py`, наш `gateway run` расписаний) раз в сутки ходит за обновлениями плагинов: фид, `git ls-remote`, PyPI | **закрываем `0`** в `applyCoreOptOuts` — тот же класс, что `updates.check: false` (HX4: их каналы обновлений не наш путь); T20.5 |
| `plugins.auto_apply` (новый) | `false` | принимаем |
| `plugins.isolation` (новый) | `in_process` | принимаем; изоляция — фаза 3 (решение 7 интервью) |
| `compression.threshold_tokens` | `256000` → `null` (порог от окна модели) | принимаем |
| `computer_use.autostart`, `memory.prefetch_spill_enabled`, `sessions.show_subagents`, `lsp.trusted_workspaces`, `attachments.storage` | новые, выключены/пусты/`hermes-home` | принимаем |
| `terminal.*_image`, `terminal.vercel_*` | образы контейнеров `nousresearch/hermes-sandbox:desktop` | не наш путь — терминал локальный |
| `stt.*`, `auxiliary.voice_chat.*`, `wake_word.provider` | новые / `auto` | мёртвые — HX19 |
| `bot_desktop.placement`, `desktop.*`, `display.tui_native` | новые | их десктоп / HX28 |
| `_config_version` | 46 → 50 | миграции при старте; наши ключи после старта — проверка T20.5 |

Умолчания, уже закрытые нами и не сменившиеся: `updates.check`, `sessions.auto_prune`, `nous.guest`,
`vault.*.enabled`; по решению 5 интервью закрываются ещё `security.allow_lazy_installs`,
`auth.adopt_external_logins`, `tools.connectors.enabled`, `telemetry.shared_metrics.*` (HX31) — T20.5.

## 4. Появилось — что нас касается

- **`shared_metrics.*` (10), `/api/shared-metrics/consent`** — общая телеметрия, HX31: мост не
  пропускает, `telemetry.shared_metrics.enabled/send: false`.
- **`i18n.catalog`, `i18n.languages`** — их каталог строк с сервера; основа перехода на их русский
  каталог (T20.8).
- **`onboarding.state/start/skip/set_run`, `free_tier.*`** — их первый запуск и бесплатная модель, HX26/HX3.
- **`plugins.catalog.lookup`** — каталог плагинов, только через наше окно согласия (UR23, T20.7).
- **`session.archive`, `machine.facts`, `connectors.accounts.rename`, `display.switchSandboxImage`** —
  их код; мост пропускает по списку, если зовёт вендорный код (T20.7).
- **`/api/local-models/download/pause|resume`** — локальные модели (UR39, берём).
- **`/api/audio/*`, событие `voice.partial`** — голос, HX19.
- **`/api/media/proxy`** — их прокси медиа для ленты; проходит через наш passthrough по списку (T20.7).

## 5. Замерено на установленном ядре (2026-10-15)

- **`hermes serve` и host-rendezvous** (`hermes_cli/main_dashboard.py::_attach_to_host_backend`):
  второй serve с живой записью `ROLE_SERVE` в каталоге блокировок либо «присоединяется» (exit 0,
  своего порта не открывает), либо при явном `--port`, который владелец не обслуживает, отказывает
  с exit 78. Каталог у нас свой на профиль (`HERMES_GATEWAY_LOCK_DIR` = `<профиль>/gateway-locks`,
  `serve.mjs`, `cron-runner-pure.ts`), так что чужой serve человека запись не делит. Остаётся
  наш же сирота на том же профиле: раньше — ошибка занятого порта, теперь — exit 0 без своего
  сервера при том же порте. `--isolated` возвращает прежнее поведение — **ставим в `serve.mjs`
  (T20.5)**. SSH-запуск (`ssh-pure.ts`) — на удалённом ядре любой версии; `--isolated` там
  неизвестен ядрам до 0.22, поэтому не трогаем, риск записан в T20.5.
  Маршрут именованного профиля (`_route_named_profile_dashboard`) у нас не срабатывает: профиль —
  собственный `HERMES_HOME`, ядро зовёт его `default` (замерено `get_active_profile_name()` на smoke-профиле).
- **Шаг первого запуска `expose_cli`** (`hermes_cli/post_update.py` → `_launchers.py::_expose_windows_user_bin`):
  на Windows кладёт команды в `<корень Hermes>\bin` (у нас — сам профиль) и **прописывает этот
  каталог в User PATH**; `cli.expose_on_path` на Windows не проверяется. На smoke-профиле
  публикация не удалась («source launcher publication failed» — нет управляемого интерпретатора
  pm), PATH не тронут. В User PATH владельца уже стоит
  `%TEMP%\aecpilot-acceptance-profile-bWlJwb\bin` от прежнего прогона приёмки. Закрытие — T20.5.
- **Проверка обновлений ядра** (`hermes_cli/source_check.py::check_for_updates(passive=True)`)
  ходит в GitHub за последним стабильным тегом и пишет `<home>/source-checks/*.json`; пассивный
  вызов закрыт `updates.check: false` — наш профиль его ставит (на smoke-профиле без конфига
  проверка прошла). `hermes --version` без `HERMES_HOME` пишет этот кэш в **личный** home Hermes
  (ловушка: так один файл попал в `%LOCALAPPDATA%\hermes\source-checks`).
- **Без их `hermes pm`**: поиск файлов берёт `rg` с PATH (запасной путь — `find`), линтеры на node
  без управляемого node пропускаются (`tools/file_operations_lint.py`), `provision_runtimes`
  запускается только явной командой. Ядро работает на venv без pm-интерпретатора (smoke зелёный).
- **Версия**: `hermes_cli.__version__` = `0.0.0` (нет `install-stamp.json` у editable-установки);
  `hermes --version` — `vgit.d923a5e (2026.9.24)`, их `__release_date__` в дереве не обновлён.
  Донорский экран «приложение старше бэкенда» по версии — мёртвый (HX4), проверка — T20.7.

## 6. Python-зависимости

Состав — T20.1 и T20.3: 91 пакет их `uv.lock` + 12 от Mem0, расхождений версий с локом 0;
`pillow-heif` снят `uv-overrides.txt`.
