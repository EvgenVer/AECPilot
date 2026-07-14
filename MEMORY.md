# MEMORY — stable cross-session context
<!-- Only durable, low-frequency facts. Do NOT store: secrets, task progress, long logs,
     or duplication of the triad. If a fact becomes part of the current task → move to TASKS/NOTES. -->
<!-- Entry format: one bullet per fact, stamped —
     `<fact>  ·  source: <where>  ·  date: <YYYY-MM-DD>  ·  confidence: high/med/low`. -->

## User preferences
- Общение и проектные документы — на русском; toolkit/код — английский · source: сессии 05–06.07 · date: 2026-07-06 · confidence: high
- TASKS обязан быть атомарным по всем фазам до старта кода; спеки писать заранее, а не декомпозировать по допущениям · source: правка владельца · date: 2026-07-06 · confidence: high
- Вопросы владельцу задавать пакетами с вариантами ответов · source: сессии grill · date: 2026-07-06 · confidence: med
- Ручные verify выдавать одной пошаговой инструкцией «что сделать → что увидеть (✓)» на один прогон `pnpm dev` · source: прогоны владельца 09–13.07 · date: 2026-07-13 · confidence: med

## Environment quirks
- Windows 11; до задачи 0.2 git сыпал LF→CRLF-варнингами (косметика; лечится .gitattributes) · source: observed · date: 2026-07-06 · confidence: high
- Ответ «Other» в вопросах с вариантами может прийти без текста (случай docgen/O5) — при пустом «другое» переспрашивать · source: observed · date: 2026-07-06 · confidence: med
- Grep/ripgrep не видит gitignored-каталоги при поиске по директории (runtime/.hermes-venv) — искать по прямому пути к файлу или bash grep · source: observed 0.17-recon · date: 2026-07-08 · confidence: high
- pnpm только через corepack (глобального нет); все корневые скрипты corepack-явные; pnpm 11 блокирует postinstall → onlyBuiltDependencies=[electron,esbuild] в pnpm-workspace.yaml · source: задачи 0.3/0.5 · date: 2026-07-06 · confidence: high
- Субагентов регулярно обрывают лимиты моделей: работа ложится в дерево БЕЗ отчёта/verify — плейбук: git status → свой verify → добор свежим executor'ом → полное ревью; эскалация ревьюера: opus → sonnet → инлайн-координатор · source: 6 обрывов за Phase 0 · date: 2026-07-13 · confidence: high
- Claude Design выгружает экраны self-decompressing бандлами (React+gzip+base64) — текстовый grep слеп, проверять распаковкой `"data":"H4sI…"`-блобов; правки — только перегенерацией в Claude Design · source: поставка v2 · date: 2026-07-14 · confidence: high
- ИНЦИДЕНТ-урок: executor выполнил corepack enable в чужой каталог (вне workspace) — откачено; брифы субагентам всегда явно запрещают модификации вне репо · source: задача 0.5 · date: 2026-07-06 · confidence: high

## Durable project facts
- Планировочный комплект (DESCRIPTION, SPECIFICATION, 6 specs, PLAN, TASKS-92) утверждён владельцем · source: сообщение владельца · date: 2026-07-06 · confidence: high
- Ядро hermes-agent не форкается; интеграция только через tui_gateway JSON-RPC/WS; AEC-слой = собственные skills + MCP · source: SPECIFICATION C1–C2 · date: 2026-07-06 · confidence: high
- Лицензии зависимостей: только MIT/Apache/BSD; AGPL/GPL запрещены · source: SPECIFICATION C3 · date: 2026-07-06 · confidence: high
- MVP на облачных LLM и эмбеддингах; переход в закрытый контур = полный re-ingest индексов (принято владельцем) · source: SPECIFICATION C5 · date: 2026-07-06 · confidence: high
- docgen в MVP — только пояснительная записка; новые типы документов = новые шаблоны (O5 закрыт) · source: ответ владельца · date: 2026-07-06 · confidence: high
- Phase 0 (0.1–0.17) реализована целиком и закоммичена: Electron-каркас с main-proxied gateway, чат (стрим, tool-карточки, approvals, сессии, настройки LLM, режимы одобрений); 96 vitest + Playwright e2e (python-mock gateway) + контрактный gateway-smoke · source: TASKS §Done · date: 2026-07-13 · confidence: high
- Hermes-ловушки интеграции: прямой OpenAI = провайдер `openai-api` (bare `openai` — алиас openrouter), модель bare-slug, ключ = env OPENAI_API_KEY; профильный `.env` ПРИОРИТЕТНЕЕ spawn-env (get_env_value_prefer_dotenv); `model.save_key` RPC пишет ключ ПЛЕЙНТЕКСТОМ в .env — запрещён (ключ только safeStorage→spawn-env); config.yaml кэшируется по mtime → записи файла применяются живо без рестарта; YAML-1.1 bare `off`=bool → approvals.mode писать в кавычках · source: исходники hermes 0.18.0 (venv) · date: 2026-07-13 · confidence: high
- GatewayClient НЕ ретраит первый connect → в main всегда `waitHealthy` перед `connect` (урок двух forensic-фиксов 0.11) · source: пробники Electron main · date: 2026-07-08 · confidence: high
- Протокольные контракты tui_gateway записаны: полный инвентарь (~170 методов/событий) — PLAN §Data/API; пофичевые карты — TASKS Done 0.8 (базовый цикл), 0.13 (approvals: FIFO без request_id, choice once/session/always/deny, allow_permanent), 0.14 (сессии: resume→НОВЫЙ sid); ошибка провайдера = message.complete status="error", не json-rpc error · source: разведки по venv-исходникам · date: 2026-07-13 · confidence: high
- Дизайн: рабочий артефакт реализации = `design/tokens.css` (+tokens.json) — light default `:root` + `[data-theme="dark"]`, значения сверены с макетами; макеты = `design/screens/*.html` (бандлы, смотреть в браузере); бриф = `design/DESIGN_BRIEF.md` · source: поставки v1/v2 · date: 2026-07-14 · confidence: high
- Пины из NOTES закрыты в PLAN §Stack: Electron 43.x (runway до 01.2027), Python 3.12.13 (hermes требует <3.14 — на 3.14 не переходить) · source: задача 0.1 · date: 2026-07-06 · confidence: high
