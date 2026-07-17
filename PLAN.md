# PLAN — AECPilot
<!-- How we build it. Do not copy requirements from SPECIFICATION; reference them. -->

## Architecture
Слои (сверху вниз):
1. **AECPilot Desktop** (Electron + React, TypeScript) — единственный UI, IDE-shell в одном окне (решения владельца 2026-07-08): левая рельса активностей (Проводник · Q&A · Вики · Источники · Память · Документы · Агент-hub) с контекстным сайдбаром; центральные табы вьюеров (PDF/DOCX/TXT/XLSX/CSV) и MD-редактора (vault и вики); **правый док чата агента** (сессии, стриминг, tool-вывод, approvals, цитаты); статус-бар; нижняя панель (индексация/логи); welcome-экран выбора проекта; командная палитра. Деревья vault и источников — один паттерн (разворачивание вглубь; контекстное меню с «показать в проводнике»). Визуал: Linear-подобный светлый минимал + полноценная тёмная тема; детальный бриф — `design/DESIGN_BRIEF.md`.
2. **hermes-agent** (Python, версия pinned) — агентное ядро **без модификаций**; приложение запускает его локальным процессом (`hermes serve`) и общается по tui_gateway JSON-RPC/WebSocket. Персона и язык агента — SOUL.md профиля пользователя; проектные правила — AGENTS.md в vault (генерируется из нашего шаблона).
3. **AEC-расширения** (наш переносимый слой):
   - MCP `aec-sources` — read-only доступ к источникам (контракт: specs/workspace-sources.md); write-операций не существует.
   - MCP `aec-rag` — Docling-парсинг + LightRAG-индекс per-project + запросы с locator-цитатами (контракт: specs/qa-over-sources.md); сюда же входит файловый индексер (sha256-скан, детект изменений).
   - MCP `aec-memory` — Mem0, scopes: user / project.
   - Skills: `aec-qa` (эталон), `aec-wiki` (адаптация бандлового `research-llm-wiki`: AEC-SCHEMA, raw/ = снапшоты источников), `aec-docgen`; `aec-id-check` — post-MVP (SPECIFICATION N9), спека заморожена.
4. **Хранилище** — files-first: vault (файлы и вики — источник истины) + `.aecpilot/` (SQLite+FTS5 `index.db`, LanceDB, конфиг, логи). Серверов нет (C4).

Границы модулей (monorepo):
```
apps/desktop/      # Electron + React (TypeScript)
mcp/aec_sources/   # Python-пакет, MCP-сервер (stdio)
mcp/aec_rag/       # Python-пакет: индексер + Docling + LightRAG + MCP-сервер
mcp/aec_memory/    # Python-пакет: Mem0 + MCP-сервер
skills/            # skill-паки (markdown, agentskills.io)
runtime/           # лончер и конфиг hermes: pinned-версия, профиль, шаблоны SOUL.md/AGENTS.md
eval/              # эвал-датасеты и раннер
specs/             # поведенческие контракты (этот репозиторий планирования)
```

Ключевые решения:
- Working dir агента = vault; источники агенту доступны **только** через `aec-sources` (N3/AC6 обеспечиваются конструкцией инструментального слоя).
- Детект изменений — наш индексер (sha256 по интервалу), без LLM; действия по изменениям — только после подтверждения в UI (N7, AC5).
- Языки (G7): UI — i18next (en/ru); язык вики — `project.json.settings.wiki_lang`; язык агента — правило в SOUL.md профиля («отвечай на языке из настроек пользователя»).
- Embedding-модель фиксируется в конфиге проекта; смена = полный re-ingest с предупреждением (C5).

## Stack & package managers
- Desktop: TypeScript, React, Electron; сборка electron-builder; пакетный менеджер pnpm.
- Python-слой: Python 3.12, менеджер uv (venv + lockfile); MCP — официальный python SDK.
- Тесты: pytest (python), Vitest (UI-юниты), Playwright (e2e smoke).
- Линтеры: ruff (py), eslint + prettier (ts).
- Точные версии ядра стека (vetting 2026-07-06, задача 0.1; lock-файлы пиннят точные патчи):

| Инструмент | Пин | Основание |
|---|---|---|
| hermes-agent | 0.18.0 (PyPI, MIT, Nous Research; requires-python >=3.11,<3.14; provenance ✔) | реестр PyPI |
| Python | 3.12.13 (security-поддержка до окт. 2028; 3.14 несовместим с hermes-agent) | endoflife.date |
| uv | 0.11.x, ≥0.11.26 (MIT/Apache-2.0, Astral) | PyPI |
| Node.js | 24 LTS, ≥24.18.0 (Active LTS; security до апр. 2028; совпадает с Node внутри Electron 43) | endoflife.date |
| Electron | 43.x, ≥43.0.0 (Chromium 150, Node 24; поддержка до янв. 2027 — самый длинный runway из трёх поддерживаемых мажоров) | endoflife.date |
| pnpm | 11.x, ≥11.10.0 (MIT; требует Node ≥22.13) | npm registry |

## Selected dependencies
Все зависимости проходят skill `dependency-vetting` перед установкой (реестр, лицензия, поддержка); версии пиннятся в lock-файлах. Лицензионное правило — C3 (только permissive).

| Пакет | Зачем | Тип | Лицензия |
|---|---|---|---|
| hermes-agent | агентное ядро | runtime (py) | MIT |
| hermes-agent[mcp] extra | MCP-*клиент* внутри hermes (нужен, чтобы hermes мог подключаться к нашим MCP-серверам, напр. aec-sources; task 1.12); тянет mcp==1.26.0 + starlette==1.0.1 — пины hermes-agent 0.18.0, установлены в изолированном `runtime/.hermes-venv`, НЕ в корневом `.venv` (там mcp==1.28.1 — SDK для наших MCP-серверов, отдельная версия) | runtime (py) | MIT |
| lightrag-hku | RAG-движок (graph+vector) | runtime (py) | MIT |
| docling | парсинг PDF/DOCX/XLSX/сканов, OCR | runtime (py) | MIT |
| mem0ai | подключаемая память | runtime (py) | Apache-2.0 |
| lancedb | embedded-векторное хранилище | runtime (py) | Apache-2.0 |
| mcp (python-sdk) | реализация MCP-серверов | runtime (py) | MIT |
| docxtpl | рендер DOCX-шаблонов (aec-docgen) | runtime (py) | MIT |
| electron, react | desktop UI | runtime (ts) | MIT |
| pdfjs-dist | PDF-вьюер | runtime (ts) | Apache-2.0 |
| docx-preview | DOCX-вьюер | runtime (ts) | MIT |
| @univerjs/* | XLSX/CSV-вьюер | runtime (ts) | Apache-2.0 |
| milkdown | MD-редактор с рендерингом | runtime (ts) | MIT |
| react-arborist | дерево проводника | runtime (ts) | MIT |
| i18next | локализация en/ru | runtime (ts) | MIT |
| electron-builder, vitest, playwright, pytest, ruff, eslint, prettier | сборка/тесты/линт | dev | MIT/Apache |

## Data / API / integrations
- **tui_gateway (JSON-RPC/WS)** — внешний контракт Hermes; фиксируем pinned-версией + контрактный smoke-тест (создать сессию, отправить сообщение, получить стрим, approval-раунд).
- **MCP-контракты наших серверов** — в specs/ (`sources_*` — workspace-sources; `rag_*` — qa-over-sources; `memory_*` — agent-memory).
- **Данные проекта** — specs/workspace-sources.md §Data schemas (`project.json`, `index.db`, `lancedb/`).
- **LLM** — OpenAI-совместимые endpoint (chat + embeddings) из настроек; MVP — облачные (решение владельца: в контуре моделей пока нет; при переходе — re-ingest).
- **Approvals-режимы (UR11)** — hermes-нативные, 3 значения `approvals.mode` в `config.yaml` профиля: `manual` (гейтит рискованное/опасное), `smart` (LLM авто-решает), `off` (bypass/YOLO). hermes перечитывает approval-конфиг **на каждой команде** → смена режима применяется живо без рестарта (в отличие от смены модели, 0.15). Наш слой: чтение/запись `approvals.mode` в config.yaml (машинерия line-merge из 0.15, обобщённая) + индикатор режима (в статус-баре по дизайну; в Phase 0 — в шапке чата). Нативный live-тумблер `config.set {key:'yolo', scope:'session'|'global'}` (off↔manual) — доступен как альтернатива/быстрый Shift+Tab-переключатель.
- **Инвентарь tui_gateway 0.18.0** (снят 2026-07-08 по установленному пакету; основание G4/UR10): ~170 методов/событий. Группы: `session.*` (create/close/list/resume/branch/compress/history/usage/undo/steer/interrupt…), `prompt.submit|background`, стрим-события (message/thinking/reasoning/tool/subagent/moa), интерактивы (`approval.*`, `clarify.*`, `sudo.*`, `secret.*`, `input.request`), `model.*` + `agent.*` (system_prompt/reasoning_effort/thinking), `skills.manage|reload`, `plugins.*`, `tools.*`/`toolsets.list`, `config.get|set|show`, `cron.manage`, `reload.mcp|env`, `rollback.list|diff|restore`, вложения (`image.*`/`pdf.attach`/`file.attach`), `voice.*`, `process/terminal/shell`, `projects.*` (собственные проекты hermes). Кандидаты «не переносим»: `billing.*`/`credits` (облако Nous), `pet.*` (игрушка), `display.*` (TUI-специфика), `learning.*` — утверждаются владельцем при детализации Agent-hub. Памяти и хуков в gateway-API нет — это файлы профиля (+slash-команды). Маппинг «группа → экран → фаза» — `design/DESIGN_BRIEF.md`.

## Validation strategy
- Детерминированное: `uv run pytest` (MCP-серверы, индексер, RO-негативные), `pnpm test` (UI-юниты), `pnpm e2e` (Playwright smoke: проект → источник → чат → цитата).
- Эвалы (skill `ai-eval-design`): `eval/qa_dataset.yaml` по specs/qa-over-sources (≥30, baseline → порог O1/AC2); smoke-эвалы `aec-id-check`/`aec-docgen` (Phase 4, критерии в их specs); обязательный прогон при изменении skill-промптов, модели, embedding-модели, RAG-параметров; иначе — оформленный waiver (AGENTS.md §9).
- Безопасность: skill `security-review` в конце Phase 2 (пути/RO/инъекции) и Phase 5 (упаковка); негативные тесты RO + injection-тип в эвале.
- Интент: полевые испытания (AC7) в Phase 5.

## Implementation phases
| Фаза | Цель | Deliverable | Проверка |
|---|---|---|---|
| **0 — Foundations** | ядро на связи | monorepo; pinned hermes; `hermes serve` запускается лончером; Electron-каркас с чатом через gateway; проверен R2 (SOUL в gateway) | ручной сквозной чат; gateway smoke-тест; пустые тест-раннеры зелёные |
| **1 — Vault & sources** | фундамент данных | vault + project.json; проводник; add/remove источника; `aec-sources`; индексер + детект + уведомления | pytest; BDD workspace-sources (вкл. на сетевой шаре); AC5/AC6 |
| **1.5 — Conformance & UX polish** | привести Phase 1 к утверждённым SPEC/PLAN/дизайну + фидбек владельца | единое дерево (vault+источники, UR2); иконки-тулбар/поиск/ПКМ-меню/Del; init в непустой папке (Obsidian); ресайз панелей; тема в Settings; фиксы багов (reload.mcp при add/remove, пустые tool-карточки, CSS-переполнения); убрать checklists/ | vitest+pytest; BDD workspace-sources (обновлён); ручной прогон владельца |
| **2 — Ingest & RAG (эталон)** | сценарий G1 целиком | Docling-пайплайн; LightRAG per-project; `aec-rag`; skill `aec-qa`; цитаты→минимальный PDF-вьюер; эвал-датасет + baseline; нагрузочная проверка (A3/R3) и замер OCR (R4); security-review | pytest; eval baseline; AC1 вручную |
| **3 — Viewers & wiki** | просмотр и вики | полные вьюеры (PDF/DOCX/XLSX/CSV); MD-редактор; skill `aec-wiki` по specs/wiki.md; рендер вики + wikilinks | BDD; тесты; AC3; AC8 |
| **4 — Memory & skills** | остальные сценарии | `aec-memory` по specs/agent-memory.md; skill `aec-docgen` по спеке + smoke-эвал; языковые настройки (SOUL-правило, wiki_lang, UI locale) | pytest; smoke-эвал; AC4; проверки G7 |
| **5 — Packaging & field** | продукт в руках | инсталлятор Windows (+mac/linux best effort); i18n-полировка; полный эвал с порогом; полевые испытания; пользовательские доки | AC1–AC8 целиком |

Дизайн-воркстрим (параллельно хвосту Phase 0): бриф `design/DESIGN_BRIEF.md` → генерация макетов владельцем в Claude Design → фиксация токенов/макетов в `design/` → задача 1.0 (перекладка UI в shell-каркас). Задачи 0.12–0.16 реализуют логику на текущем минимальном layout; их UI переезжает в дизайн-shell задачей 1.0 без переписывания логики (reducer/IPC от разметки не зависят).

Phase 1.5 (параллельно Phase 2, ручной прогон владельца 2026-07-17): бо́льшая часть — conformance к уже утверждённым SPEC UR2 (единое дерево vault+источники) и PLAN §Architecture (один паттерн деревьев, контекстное меню), которые Phase 1 реализовала как отдельную вкладку источников. Новые решения владельца: (1) init проекта в непустой папке (Obsidian-style, существующие файлы неприкосновенны); (2) ресайз панелей (проводник/вьюер/чат) как в VS Code с сохранением размеров. Дизайн-референс при пробелах в макетах — VS Code (иконки-тулбар, поиск по дереву, ПКМ-меню, Del). Отложено с явной пометкой: складка чата (tool-вызовы + ход рассуждений, `thinking`/`reasoning`-события gateway есть в инвентаре §Data/API) — паритет с Hermes Desktop (G4/UR4), делается когда дозреет Agent-hub; ревью и утверждение содержимого шаблона AGENTS.md (перед Phase 3 wiki — половина правил про вики/память).

Каждая фаза заканчивается: тесты зелёные → self-review (`code-review`) → коммит → сверка планов (TASKS/SPEC актуальны).

## Risks & tradeoffs
- **Hermes churn** → pin + только gateway + контрактный smoke; цена: новые фичи ядра подключаем осознанными апгрейдами, не автоматически.
- **Двойной рантайм (Node + Python)** → сложнее упаковка (R5); принято ради ядра Hermes и python-экосистемы RAG; референс упаковки — apps/desktop Hermes.
- **Embedded-хранилища** → пределы масштаба (R3); принято ради «без серверов» (C4); контроль — нагрузочная проверка Phase 2, fallback — ограничение объёма проекта в MVP.
- **Свой shell вместо форка Hermes Desktop** → базовый чат-UX делаем сами (дороже Phase 0/2), зато без чужого продуктового кода и merge-долга; их код — открытый референс.
- **Облачные эмбеддинги в MVP** → быстрый старт; цена — полный re-ingest при переходе в закрытый контур (решение владельца, зафиксировано в C5).
- **3 skills в MVP** → риск распыления (снижен выводом `aec-id-check` из MVP, N9); контроль — эталонный только `aec-qa` (полировка+эвал), остальные принимаются по smoke-критериям.
- **R2 (SOUL.md↔gateway, issue #26596)** → проверено на 0.18.0: SOUL.md применяется в gateway-режиме — `runtime/soul-check.mjs` (маркер `AEC-SOUL-ACTIVE` в ответе модели) даёт exit 0; в наблюдённых прогонах маркер приходил в самом начале первой строки. Гейт проверяет наличие маркера в ответе целиком (`includes`), не только в первой строке. Workaround не понадобился.
