# TASKS — AECPilot
<!-- Atomic checklist. One concrete action per task, with a clear done-check.
     Atomic = single concrete action, no further planning needed.
     ID-формат: <фаза>.<номер>; dep указывает ID блокирующих задач. -->

## Active

### Phase 0 — Foundations
- [ ] 0.11 Реализовать чат-панель: отправка сообщения, стриминговый рендер ответа — files: apps/desktop · verify: ручной сквозной чат в своём окне · dep: 0.10 · parallel: no — **[КОД ГОТОВ, ждёт ручного verify владельца]**: main-proxied GatewayClient + IPC-мост (contextBridge: submitPrompt/onChatEvent/onGatewayState, токен только в main), чистый reducer chat-state.ts + ChatPanel.tsx; авто-проверки зелёные (30/30 тестов вкл. 10 на reducer, typecheck/lint/format:check/electron-vite build), ревью (sonnet, свежий контекст) 0 blocker/major, 1 minor (secret-hygiene инвариант — зафиксирован комментарием у конструктора GatewayClient), 1 nit (TODO cwd=vault, Phase 1). Отметить [x] после прогона владельцем: `pnpm dev` → сообщение → «Connected» → стриминговый ответ. FORENSIC-фикс (ручной verify #1 показал «Disconnected», Send заблокирован): изолирована гонка — `main` делал `await connect()` ДО `createWindow()`, поэтому push `onStateChange('ready')` уходил при пустом `getAllWindows()`, renderer навсегда оставался на 'closed'; `WebSocket` в Electron main подтверждён пробником (не причина). Фикс-1: pull-канал `gateway:get-state` + гидрация состояния в ChatPanel на mount (live-событие перекрывает снапшот). FORENSIC #2 (verify #2 снова «Disconnected» + `gateway connect FAIL` в терминале): пробник Electron main дал immediate-connect FAIL / after-waitHealthy OK / полный цикл session→prompt→«PONG» OK → корень: `main` коннектился ДО готовности gateway (без waitHealthy), а GatewayClient не ретраит первый connect → Фикс-2: `await waitHealthy(serveHandle, 30000)` перед connect. Оба фикса нужны вместе. Ждёт ручного прогона #3
- [ ] 0.12 Реализовать рендер вывода инструментов (стрим tool-событий) в чате — files: apps/desktop · verify: тестовая сессия показывает вызовы инструментов · dep: 0.11 · parallel: yes
- [ ] 0.13 Реализовать approvals-диалог по событиям gateway — files: apps/desktop · verify: ручной сценарий с действием, требующим approve · dep: 0.11 · parallel: yes
- [ ] 0.14 Реализовать список/создание/переключение сессий с историей — files: apps/desktop · verify: две сессии, история переживает рестарт приложения · dep: 0.11 · parallel: yes
- [ ] 0.15 Реализовать настройки LLM (endpoint/key/model; ключ в safeStorage) с применением к hermes-профилю — files: apps/desktop, runtime/ · verify: смена endpoint меняет модель в чате; ключа нет в plaintext-конфигах · dep: 0.7 · parallel: yes
- [ ] 0.16 Настроить Playwright e2e-smoke (старт приложения, окно, чат с mock-gateway) — files: apps/desktop/e2e/** · verify: `pnpm e2e` зелёный · dep: 0.11 · parallel: yes

### Phase 1 — Vault & sources (спека: specs/workspace-sources.md)
- [ ] 1.1 Определить схему project.json (TS-типы + JSON-schema + schema_version) и валидатор — files: apps/desktop/src/project/** · verify: юниты валидный/невалидный конфиг · dep: Phase 0 · parallel: yes
- [ ] 1.2 Реализовать генератор структуры vault (wiki/, workspace/, templates/, checklists/, .aecpilot/, AGENTS.md из шаблона) — files: apps/desktop, runtime/templates/ · verify: юнит: структура и стартовые файлы создаются · dep: 1.1 · parallel: no
- [ ] 1.3 Реализовать UI «создать проект» (выбор пустой папки → генератор → открытие) — files: apps/desktop · verify: BDD «Создание проекта» · dep: 1.2 · parallel: no
- [ ] 1.4 Реализовать UI «открыть проект» + список недавних (persist в конфиге приложения) — files: apps/desktop · verify: повторное открытие из списка · dep: 1.3 · parallel: yes
- [ ] 1.5 Написать шаблон проектного AGENTS.md (источники только через aec-sources; правила вики; правило памяти) — files: runtime/templates/AGENTS.md · verify: генерируется в новый vault; содержание проходит ревью в self-review фазы · dep: 1.2 · parallel: yes
- [ ] 1.6 Реализовать дерево vault (react-arborist): отображение, создание/переименование/удаление файлов и папок — files: apps/desktop · verify: компонентные тесты + ручной прогон · dep: 1.3 · parallel: yes
- [ ] 1.7 Реализовать UI добавления источника (диалог, валидации: вложенность vault/источник, пересечения путей; запись в project.json) — files: apps/desktop · verify: юниты валидаций + BDD «Подключение источника» · dep: 1.3 · parallel: yes
- [ ] 1.8 Отобразить источники в дереве с RO-бейджем и статусом доступности (unavailable при ошибке доступа) — files: apps/desktop · verify: BDD «Недоступный источник» (мок ошибки) · dep: 1.7 · parallel: no
- [ ] 1.9 Реализовать каркас MCP aec-sources (stdio, mcp-sdk, конфиг корней из project.json) — files: mcp/aec_sources · verify: tools/list отдаёт 4 инструмента · dep: 0.4 · parallel: yes
- [ ] 1.10 Реализовать sources_list / sources_tree / sources_stat — files: mcp/aec_sources · verify: pytest на фикстурной структуре · dep: 1.9 · parallel: no
- [ ] 1.11 Реализовать sources_read (+range) с анти-traversal (нормализация, запрет выхода за root) — files: mcp/aec_sources · verify: pytest, включая негативные `../` · dep: 1.9 · parallel: yes
- [ ] 1.12 Зарегистрировать aec-sources в hermes-профиле (MCP-конфиг) — files: runtime/ · verify: агент в чате перечисляет источники проекта · dep: 1.10, 0.9 · parallel: no
- [ ] 1.13 Реализовать индексер: обходчик источников (фильтры, лимит размера, защита от циклов) + sha256 + index.db (SQLite: files, заготовка FTS5) — files: mcp/aec_rag · verify: pytest фикстуры add/change/delete → статусы · dep: 1.10 · parallel: yes
- [ ] 1.14 Реализовать планировщик сканирования (интервал из настроек + «сканировать сейчас») — files: apps/desktop, mcp/aec_rag · verify: юнит планировщика + ручной запуск · dep: 1.13 · parallel: no
- [ ] 1.15 Реализовать UI-уведомление об изменениях (список изменённого, действия-заглушки, ничего без подтверждения) — files: apps/desktop · verify: BDD «Детект изменений» (AC5) · dep: 1.14 · parallel: no
- [ ] 1.16 Реализовать пометки detached при отключении источника + UI remove source — files: apps/desktop, mcp/aec_rag · verify: BDD «Отключение источника» · dep: 1.13, 1.7 · parallel: yes
- [ ] 1.17 Написать негативные RO-тесты и журнал logs/ отклонённых попыток — files: mcp/aec_sources, тесты · verify: pytest негативные + ручной сценарий «агент, создай файл в источнике» → отказ + запись в журнале (AC6) · dep: 1.12 · parallel: yes
- [ ] 1.18 Покрыть edge-фикстуры: UNC-мок, кириллица, длинные пути, залоченный файл, symlink-цикл — files: тесты mcp/ · verify: pytest зелёный · dep: 1.13 · parallel: yes
- [ ] 1.19 Написать интеграционный тест цикла: подключить → скан → изменить → уведомление (headless) — files: тесты · verify: pytest integration зелёный · dep: 1.15 · parallel: yes

### Phase 2 — Ingest & RAG, эталонный сценарий (спека: specs/qa-over-sources.md)
- [ ] 2.1 Подключить Docling: text-PDF → markdown с постраничным locator — files: mcp/aec_rag · verify: pytest на образце (страницы в мета) · dep: Phase 1 · parallel: yes
- [ ] 2.2 Прогнать замер OCR-движков Docling на ≥5 реальных ru-сканах, выбрать дефолт (R4) — files: eval/ocr-report.md, PLAN.md §Risks · verify: таблица результатов + решение записано · dep: 2.1 · parallel: yes
- [ ] 2.3 Включить OCR-путь для скан-PDF с выбранным движком — files: mcp/aec_rag · verify: pytest скан-фикстура (текст+страницы) · dep: 2.2 · parallel: no
- [ ] 2.4 Подключить DOCX → markdown (+заголовки как locator-кандидаты) — files: mcp/aec_rag · verify: pytest образец · dep: 2.1 · parallel: yes
- [ ] 2.5 Подключить XLSX/CSV → таблицы (locator: лист/диапазон) — files: mcp/aec_rag · verify: pytest образец · dep: 2.1 · parallel: yes
- [ ] 2.6 Реализовать чанкер поверх markdown (заголовки/размер; таблицы целиком; locator в мета) — files: mcp/aec_rag · verify: юниты на границы чанков · dep: 2.1 · parallel: yes
- [ ] 2.7 Решить O4: формат locator и открытия места для DOCX/XLSX (мини-прототип, фиксация в specs/qa-over-sources.md) — files: specs/qa-over-sources.md · verify: спека обновлена, владелец подтвердил · dep: 2.4, 2.5 · parallel: yes
- [ ] 2.8 Инициализировать LightRAG per-project (.aecpilot/, embedded-хранилища, embedding-модель из настроек) — files: mcp/aec_rag · verify: индекс создаётся в .aecpilot/ · dep: 2.6 · parallel: no
- [ ] 2.9 Реализовать инкрементальный ingest по index.db (changed/new; удаление deleted) + наполнение FTS5 текстом — files: mcp/aec_rag · verify: pytest: повторный ingest без дублей; FTS находит фразу · dep: 2.8, 1.13 · parallel: no
- [ ] 2.10 Реализовать MCP-инструмент rag_ingest (джоб + события прогресса) — files: mcp/aec_rag · verify: контрактный тест по спеке · dep: 2.9 · parallel: no
- [ ] 2.11 Реализовать rag_status и rag_query (top_k, фильтры, locator в результатах) — files: mcp/aec_rag · verify: контрактные тесты по спеке · dep: 2.10 · parallel: no
- [ ] 2.12 Написать skill aec-qa (SKILL.md: только rag_query, формат [src:…], «не найдено», противоречащие редакции) и зарегистрировать — files: skills/aec-qa · verify: ручной прогон 8 BDD-сценариев спеки · dep: 2.11, 1.12 · parallel: no
- [ ] 2.13 Реализовать парсер цитат [src:…] в чате → кликабельные ссылки — files: apps/desktop · verify: юнит парсера (вкл. кривые ссылки) · dep: 2.12 · parallel: no
- [ ] 2.14 Реализовать минимальный PDF-вьюер (pdfjs): открыть файл, перейти к странице из цитаты — files: apps/desktop · verify: клик из цитаты открывает нужную страницу (ядро AC1) · dep: 2.13 · parallel: no
- [ ] 2.15 Показать прогресс ingest и rag_status в UI (статус индекса, устаревшие) — files: apps/desktop · verify: ручной прогон + UR8 · dep: 2.10 · parallel: yes
- [ ] 2.16 Составить эвал-датасет ≥30 вопросов по эталонному проекту (типы factual/table/scan/negative/injection) + раннер (LLM-judge, отчёт) — files: eval/qa_dataset.yaml, eval/runner · verify: датасет валиден, раннер отчитывается на 3 пробных вопросах · dep: 2.12 · parallel: yes
- [ ] 2.17 Снять baseline эвала и предложить владельцу порог (O1) — files: eval/reports/ · verify: baseline-отчёт сохранён, порог предложен · dep: 2.16 · parallel: no
- [ ] 2.18 Прогнать нагрузочную проверку A3/R3 (объём эталонного проекта ×2: время/память/токены/стоимость) — files: eval/load-report.md, PLAN.md §Risks · verify: отчёт с числами, выводы внесены · dep: 2.11 · parallel: yes
- [ ] 2.19 Прогнать security-review поверхностей Phase 0–2 (пути, RO, инъекции, хранение ключей) — files: отчёт в AGENT_RUNS.md · verify: критичных находок нет либо устранены · dep: 2.14 · parallel: yes

### Phase 3 — Viewers & wiki (спека: specs/wiki.md)
- [ ] 3.1 Довести PDF-вьюер: вкладки, поиск по тексту, зум — files: apps/desktop · verify: AC8-прогон PDF (вкл. битый файл → понятная ошибка) · dep: 2.14 · parallel: yes
- [ ] 3.2 Реализовать DOCX-вьюер (docx-preview) и TXT-просмотр — files: apps/desktop · verify: AC8-прогон DOCX/TXT · dep: Phase 2 · parallel: yes
- [ ] 3.3 Реализовать XLSX/CSV-вьюер (Univer, read-only) — files: apps/desktop · verify: AC8-прогон XLSX/CSV (вкл. большой файл) · dep: Phase 2 · parallel: yes
- [ ] 3.4 Реализовать открытие DOCX/XLSX по locator из цитат (по решению O4) — files: apps/desktop · verify: клик из цитаты открывает место · dep: 3.2, 3.3, 2.7 · parallel: no
- [ ] 3.5 Встроить MD-редактор (Milkdown): рендер+правка файлов vault, автосохранение — files: apps/desktop · verify: правка сохраняется, undo работает · dep: Phase 2 · parallel: yes
- [ ] 3.6 Реализовать wikilinks в MD-редакторе: навигация [[…]], создание страницы по клику на несуществующую — files: apps/desktop · verify: ручной прогон навигации · dep: 3.5 · parallel: no
- [ ] 3.7 Реализовать генератор wiki/-структуры и дефолтной AEC-SCHEMA.md — files: mcp/aec_rag или runtime/templates · verify: юнит: структура по specs/wiki.md · dep: 1.2 · parallel: yes
- [ ] 3.8 Реализовать skill aec-wiki: операция build (страницы, frontmatter, провенанс, raw/-снапшоты, index/log) — files: skills/aec-wiki · verify: BDD «Первичное построение» на мини-фикстуре · dep: 3.7, 2.12 · parallel: no
- [ ] 3.9 Реализовать операцию update (инкрементально по изменённым; противоречия — явными блоками) — files: skills/aec-wiki · verify: BDD «Инкрементальное обновление» · dep: 3.8 · parallel: no
- [ ] 3.10 Обеспечить сохранение ручных правок при update (аддитивное обновление) — files: skills/aec-wiki · verify: BDD «Ручная правка сохраняется» · dep: 3.9 · parallel: no
- [ ] 3.11 Реализовать lint вики (битые ссылки, сироты, staleness по sha, frontmatter, незакрытые противоречия) — files: skills/aec-wiki, mcp/aec_rag · verify: pytest-фикстуры дефектов + BDD «Lint» · dep: 3.8 · parallel: yes
- [ ] 3.12 Реализовать query по вики (обзорные ответы со ссылками на страницы) — files: skills/aec-wiki · verify: BDD «Query» · dep: 3.8 · parallel: yes
- [ ] 3.13 Связать детект изменений с вики: действие «обновить вики» из уведомления (1.15) — files: apps/desktop · verify: сквозной прогон изменение→уведомление→подтверждение→update · dep: 3.9, 1.15 · parallel: no
- [ ] 3.14 Прогнать smoke-эвал aec-wiki (≥5 сценариев по спеке: покрытие, провенанс, противоречие) — files: eval/ · verify: отчёт соответствует критериям спеки · dep: 3.10 · parallel: yes
- [ ] 3.15 Прогнать AC3 на эталонном проекте — files: отчёт в AGENT_RUNS.md · verify: чек-лист AC3 полностью · dep: 3.11, 3.12 · parallel: no

### Phase 4 — Memory & remaining skills (спеки: specs/agent-memory.md, specs/id-check.md, specs/docgen.md)
- [ ] 4.1 Реализовать MCP aec-memory (Mem0 embedded; скоупы user/project; пути хранения по спеке) — files: mcp/aec_memory · verify: pytest add/search/list/delete + персистентность после рестарта · dep: Phase 0 · parallel: yes
- [ ] 4.2 Реализовать автозапись: слушатель событий сессий gateway → Mem0.add + паттерн-фильтр секретов — files: mcp/aec_memory, apps/desktop · verify: pytest на диалогах-фикстурах; секреты не сохраняются · dep: 4.1 · parallel: no
- [ ] 4.3 Включить recall: memory_search как инструмент агента + правило в шаблоне AGENTS.md (1.5) — files: runtime/, skills/ · verify: ручной сценарий «факт из прошлой сессии влияет на ответ» · dep: 4.1, 1.5 · parallel: yes
- [ ] 4.4 Реализовать UI журнала памяти (списки user/project, удаление, переключатель автозаписи) — files: apps/desktop · verify: BDD «Управление памятью» · dep: 4.2 · parallel: no
- [ ] 4.5 Прогнать smoke-эвал aec-memory (≥5 сценариев по спеке) — files: eval/ · verify: отчёт по критериям · dep: 4.3 · parallel: yes
- [ ] 4.6 Реализовать парсер/валидатор чек-листа + дефолтный id-checklist.yaml в генераторе vault — files: mcp или skills, runtime/templates · verify: юниты + файл появляется в новом проекте · dep: 1.2 · parallel: yes
- [ ] 4.7 Реализовать skill aec-id-check: комплектность по чек-листу (отчёт md+json со ссылками и статусами) — files: skills/aec-id-check · verify: BDD «Комплектность» + «Пункт не найден» на фикстуре · dep: 4.6, 2.12 · parallel: no
- [ ] 4.8 Реализовать поиск противоречий (нормализация единиц; «редакция vs смежники»; серьёзность) — files: skills/aec-id-check · verify: BDD «Противоречия» + юниты нормализации единиц · dep: 4.7 · parallel: no
- [ ] 4.9 Прогнать smoke-эвал aec-id-check (фикстурный проект с заложенными дефектами; метрики спеки) — files: eval/ · verify: отчёт (AC4, часть 1) · dep: 4.8 · parallel: yes
- [ ] 4.10 Реализовать механизм шаблонов docgen: parсер manifest.yaml + рендер DOCX (docxtpl) + маркировка «НЕ НАЙДЕНО» — files: mcp или skills · verify: юнит подстановки на тестовом шаблоне, стили сохранены · dep: 1.2 · parallel: yes
- [ ] 4.11 Реализовать skill aec-docgen (сбор данных → заполнение → drafts/ + report.md с провенансом и конфликтами) — files: skills/aec-docgen · verify: BDD-сценарии спеки · dep: 4.10, 2.12 · parallel: no
- [ ] 4.12 Подготовить референс-шаблон ПЗ с владельцем и прогнать на эталонном проекте — files: templates-пример, eval/ · verify: черновик собирается, отчёт корректен · dep: 4.11 · parallel: no
- [ ] 4.13 Прогнать smoke-эвал aec-docgen (≥5; «0 выдуманных значений») — files: eval/ · verify: отчёт (AC4, часть 2) · dep: 4.12 · parallel: yes
- [ ] 4.14 Реализовать языковые настройки: правило языка в SOUL-шаблоне, wiki_lang в настройках проекта, переключатель UI-locale (i18next en/ru, каркас словарей) — files: runtime/, apps/desktop · verify: ручные проверки G7 (три уровня языка) · dep: 0.9 · parallel: yes

### Phase 5 — Packaging & field
- [ ] 5.1 Изучить упаковку apps/desktop Hermes (бандл Python) и зафиксировать нашу стратегию бандла — files: PLAN.md · verify: решение записано в PLAN · dep: Phases 0–4 функционально готовы · parallel: no
- [ ] 5.2 Настроить electron-builder для Windows с бандлом рантаймов (Node app + Python venv + модели Docling) — files: конфиги сборки · verify: инсталлятор ставится на чистую VM · dep: 5.1 · parallel: no
- [ ] 5.3 Прогнать AC1 на чистой машине (полный сквозной сценарий) — files: отчёт в AGENT_RUNS.md · verify: чек-лист AC1 · dep: 5.2 · parallel: no
- [ ] 5.4 Собрать macOS/Linux (best effort) — files: конфиги сборки · verify: запуск + smoke на каждой платформе · dep: 5.2 · parallel: yes
- [ ] 5.5 Прогнать полный эвал всех скиллов и зафиксировать порог AC2 с владельцем — files: eval/reports/ · verify: отчёт ≥ порога; порог записан в SPECIFICATION (закрытие O1) · dep: 2.17, 3.14, 4.9, 4.13 · parallel: yes
- [ ] 5.6 Отполировать i18n en/ru по всем экранам (добивка словарей) — files: apps/desktop · verify: ручной проход обоих locale · dep: 4.14 · parallel: yes
- [ ] 5.7 Провести полевые испытания: установка ≥2 инженерам, реальный проект, 2 недели, канал обратной связи, итоговый отчёт — files: NOTES.md → AGENT_RUNS.md · verify: AC7 + отчёт с находками · dep: 5.3 · parallel: no
- [ ] 5.8 Написать пользовательскую документацию (README, quickstart ru/en) — files: README.md, docs пользователя · verify: проверка по skill docs-maintenance · dep: 5.3 · parallel: yes
- [ ] 5.9 Финальная сверка: SPECIFICATION/PLAN/TASKS актуальны, AC1–AC8 сведены в итоговый отчёт — files: планировочные файлы · verify: consistency-review пройден · dep: все · parallel: no

## Blocked
- (пусто)

## Discovered
<!-- Subtasks found during work. -->
- Гейт-пробел: корневой `lint` = eslint+tsc+ruff, но НЕ `prettier --check` — prettier-дрейф проскакивает (поймано на 0.11: файл 0.10 был не отформатирован, исправлено коммитом ad6f7bd). Предложение владельцу: добавить `format:check` в `lint` (apps/desktop и/или корень), чтобы формат-гейт был обязательным.

## Done
- [x] 0.1 Провести dependency-vetting и запиннить ядро стека — verified: реестры PyPI/npm/endoflife проверены 2026-07-06; версии в PLAN §Stack (hermes-agent 0.18.0, Python 3.12.13, uv ≥0.11.26, Node 24 LTS, Electron 43.x, pnpm 11.x)
- [x] 0.2 Добавить .gitattributes и .editorconfig — verified: `git add --renormalize .` прошёл без LF/CRLF-варнингов
- [x] 0.3 pnpm-workspace + каркас apps/desktop — verified: corepack pnpm install/build ок (pnpm 11.10.0, electron 43.0.0, vite 7.3.6); smoke AEC_SMOKE=1 → «window created»/«smoke ok» по did-finish-load, exit 0; ревью: 1 major (битый lint-скрипт) + minor/nits — исправлены за 1 итерацию; onlyBuiltDependencies=[electron,esbuild] одобрен ревью как минимальный
- [x] 0.4 uv-workspace + каркас mcp/aec_sources — verified: uv sync ок (managed Python 3.12.13), `uv run pytest -q` → 1 passed; ревью: pytest сужен до >=8,<10, aec-sources перенесён в dev-группу (1 итерация)
- [x] 0.5 Линтеры и корневые команды — verified: `corepack pnpm lint` = eslint (0/0) + tsc --noEmit + ruff «All checks passed!»; format:check зелёный; eslint flat config с reactHooks.configs.flat.recommended; все корневые скрипты corepack-явные (работают без pnpm в PATH); ревью: без блокеров, minor/nit закрыты за 1 итерацию; побочный эффект executor'а (corepack-шимы в каталоге hermes) откачен полностью по решению владельца (12 файлов удалено, node.exe цел)
- [x] 0.8 Контрактный gateway-smoke — verified: `node runtime/gateway-smoke.mjs` → полный цикл session.create → prompt.submit → стрим (message.start/delta/complete) → session.close с реальным ответом модели «PONG», exit 0 (ключ вписан владельцем в runtime/dev-profile/.env, вне git); без ключа — exit 2 «PROTOCOL OK, MODEL AUTH PENDING», не-auth ошибки — exit 3; вывод через redact (sk-маскирование, юнит-проверено); карта протокола tui_gateway снята и записана (для 0.10); конфиг-ловушки: провайдер прямого OpenAI = `openai-api` (не `openai`!), модель bare-slug; ревью: 1 major (утечка 401-текста) + 2 minor — исправлены за 1 итерацию
- [x] 0.7 Запуск/останов hermes serve из Node — verified: `node runtime/serve.mjs smoke` → JSON-RPC frame gateway.ready, exit 0, процессов/порта не остаётся; Electron: serve стартует на whenReady (гейт AEC_SMOKE), останов через preventDefault+await в before-quit (quit-путь проверен: SIGTERM в serve.log, дерево гашено); разведка: ws://127.0.0.1:18789/api/ws, newline-delimited JSON-RPC, токен через HERMES_DASHBOARD_SESSION_TOKEN, serve стартует без LLM-ключа; ревью (fable из-за лимита opus): 1 major (quit-путь) + 3 minor — исправлены за 1 итерацию; TODO(Phase 5) про app.asar-раскладку помечен в коде и README
- [x] 0.6 runtime-лончер: изолированные venv + HERMES_HOME — verified: `hermes.exe --version` из runtime/.hermes-venv = 0.18.0 (Python 3.12.13); `hermes config path` с HERMES_HOME → runtime/dev-profile (пользовательская установка не тронута — mtime-diff пустой, содержимое не читалось); setup.mjs идемпотентен; ревью: чисто, 2 minor/2 nit исправлены за 1 итерацию; POSIX-ветка помечена как непроверенная (Windows-target Phase 0)
- [x] 0.9 Проверить R2 (SOUL.md в gateway) — verified: `node runtime/soul-check.mjs` с маркерным SOUL.md в dev-профиле → ответ модели «AEC-SOUL-ACTIVE Hello…», маркер присутствует, exit 0 → SOUL.md применяется в gateway-режиме 0.18.0, R2 НЕ воспроизводится, workaround не нужен (вердикт в PLAN §Risks); нейтральный SOUL восстановлен (bak-copy, 56 байт); регресс рефактора: `node runtime/gateway-smoke.mjs` → «PONG» exit 0 — общие хелперы вынесены в runtime/gateway-client.mjs (connectWs/rpcCall/collectTurn/redact), поведение и exit-коды 0/1/2/3 сохранены; новый runtime/soul-check.mjs (exit 0=применяется / 1=R2 воспроизведён / 2=inconclusive); ревью (reviewer, свежий контекст): 0 blocker/major, 1 minor (формулировка PLAN «первая строка» vs код `includes` — исправлена) + 2 nit оставлены осознанно
- [x] 0.10 WS-клиент tui_gateway (GatewayClient) — verified: `corepack pnpm -C apps/desktop test` → vitest 20/20 (10 event-dispatch + 6 request() + 4 reconnect/backoff), `corepack pnpm lint` (eslint+tsc+ruff) «All checks passed!»; types.ts — discriminated union протокола + `isGatewayEventOfType` (Extract-предикат, обходит поломку narrowing из-за `UnknownGatewayEvent.type: string`); client.ts — connect (resolve на gateway.ready) / request (id-match + timeout, гард по state==='ready') / onEvent / onStateChange / auto-reconnect (exp backoff, cap, maxAttempts, сброс на ready); файлы в apps/desktop/src/shared/gateway/** (не src/gateway — клиент общий для main/renderer, отклонение принято координатором); typecheck-фикс (упавший 1-й executor оставил 11 ошибок tsc) + fix-итерация по ревью: 2 major (двойной handleDisconnect по паре close+error → дедуп по идентичности сокета; request() слал на неоткрытом сокете → гард state==='ready' + try/catch без утечки pending), 3 minor (изоляция throw-listener'ов; валидация формы error-фрейма в parseFrame; re-entrancy connect()), 1 nit (try/catch конструктора WebSocket) + добавлены регресс-тесты на обе major-ветки и жизненный цикл request()/reconnect; ревью: opus и fable упали на лимите сессии → первичное ревью проведено на sonnet (свежий контекст), fix-дельта пере-ревьюена координатором инлайн (§10, субагенты-ревьюеры недоступны)
