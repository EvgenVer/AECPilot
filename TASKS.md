# TASKS — AECPilot
<!-- Atomic checklist. One concrete action per task, with a clear done-check.
     Atomic = single concrete action, no further planning needed. -->

## Active

### Phase 0 — Foundations
- [ ] Провести dependency-vetting и запиннить ядро стека (hermes-agent, electron, node, python 3.12, uv, pnpm) — files: PLAN.md (версии) · verify: версии записаны, реестры/лицензии проверены · dep: none · parallel: yes
- [ ] Создать scaffold monorepo (apps/desktop, mcp/*, skills/, runtime/, eval/) с линтерами и тест-раннерами — files: корень репо · verify: `pnpm install`, `uv sync`, `pytest -q`, `pnpm test` проходят на пустых наборах · dep: vet&pin · parallel: no
- [ ] Реализовать runtime-лончер: изолированный HERMES_HOME, запуск `hermes serve`, health-check gateway — files: runtime/ · verify: smoke-скрипт получает JSON-RPC-ответ · dep: scaffold · parallel: no
- [ ] Проверить R2: SOUL.md применяется в gateway-режиме на pinned-версии — files: runtime/, NOTES.md · verify: персона/язык видны в ответах; при баге — workaround задокументирован в PLAN · dep: лончер · parallel: no
- [ ] Собрать Electron-каркас: окно, подключение к gateway, чат (сессия, стриминг, approvals) — files: apps/desktop · verify: ручной сквозной чат с агентом · dep: лончер · parallel: no
- [ ] Сделать настройки LLM (endpoint/key/model) в UI с записью в hermes-профиль — files: apps/desktop, runtime/ · verify: смена endpoint меняет модель в чате · dep: каркас · parallel: no

### Phase 1 — Vault & sources
- [ ] Реализовать создание/открытие vault и project.json по схеме — files: apps/desktop · verify: BDD «Создание проекта» · dep: Phase 0 · parallel: no
- [ ] Построить дерево-проводник (vault + источники) с add/remove источника, RO-бейджами и валидацией путей — files: apps/desktop · verify: BDD «Подключение/Отключение источника» · dep: project.json · parallel: no
- [ ] Реализовать MCP `aec-sources` (list/tree/read/stat, без write) и зарегистрировать в hermes-профиле — files: mcp/aec_sources · verify: pytest + негативный BDD «Гарантия read-only» (AC6) · dep: project.json · parallel: yes
- [ ] Реализовать индексер: скан источников, sha256, index.db (SQLite+FTS5), статусы, интервал — files: mcp/aec_rag · verify: pytest-фикстуры add/change/delete · dep: aec-sources · parallel: no
- [ ] Подключить детект изменений к UI: уведомление со списком и предлагаемыми действиями, без автодействий — files: apps/desktop · verify: BDD «Детект изменений» (AC5) · dep: индексер · parallel: no
- [ ] Покрыть edge-набор Phase 1 тестами (UNC, кириллица, длинные пути, залоченные файлы, циклы, вложенность vault/источник) — files: тесты mcp/ · verify: pytest зелёный на фикстурах · dep: индексер · parallel: yes

### Phase 2 — Ingest & RAG (эталонный сценарий)
- [ ] Реализовать Docling-пайплайн: PDF/DOCX/XLSX/сканы → markdown + таблицы + OCR (ru) — files: mcp/aec_rag · verify: pytest на образцах каждого формата · dep: Phase 1 · parallel: no
- [ ] Встроить LightRAG per-project (embedded-хранилища в .aecpilot/) с инкрементальным ingest — files: mcp/aec_rag · verify: pytest: повторный ingest не дублирует чанки · dep: Docling-пайплайн · parallel: no
- [ ] Реализовать MCP `aec-rag`: rag_ingest / rag_status / rag_query с locator — files: mcp/aec_rag · verify: контрактные тесты по specs/qa-over-sources · dep: LightRAG · parallel: no
- [ ] Написать skill `aec-qa`: только по rag_query, формат цитат [src: ...], явное «не найдено» — files: skills/aec-qa · verify: ручные BDD happy/negative · dep: aec-rag · parallel: no
- [ ] Сделать UI-цитаты: парсинг [src: ...] в чате → открытие файла (минимальный PDF-вьюер со страницей) — files: apps/desktop · verify: AC1 вручную · dep: skill aec-qa · parallel: no
- [ ] Составить эвал-датасет ≥30 (factual/table/scan/negative/injection) + раннер, снять baseline, предложить порог (O1) — files: eval/ · verify: baseline-отчёт сохранён, порог предложен владельцу · dep: skill aec-qa · parallel: yes
- [ ] Провести нагрузочную проверку A3/R3 (объём эталонного проекта с запасом) и замер OCR R4 — files: eval/, NOTES.md · verify: отчёт с числами, выводы внесены в PLAN §Risks · dep: aec-rag · parallel: yes
- [ ] Прогнать security-review по поверхностям Phase 0–2 (пути, RO, инъекции, хранение ключей) — files: — · verify: отчёт без критичных находок · dep: aec-rag · parallel: yes

### Phase 3 — Viewers & wiki
- [ ] Довести PDF-вьюер (pdfjs): вкладки, переход на страницу из цитаты — files: apps/desktop · verify: AC8 + цитаты→страница · dep: Phase 2 · parallel: yes
- [ ] Добавить DOCX-вьюер (docx-preview) и TXT-просмотр — files: apps/desktop · verify: AC8 · dep: Phase 2 · parallel: yes
- [ ] Добавить XLSX/CSV-вьюер (Univer) — files: apps/desktop · verify: AC8 · dep: Phase 2 · parallel: yes
- [ ] Встроить MD-редактор с рендерингом (Milkdown) для vault/вики + навигация по wikilinks — files: apps/desktop · verify: правка сохраняется, ссылки кликабельны · dep: Phase 2 · parallel: yes
- [ ] Написать specs/wiki.md (адаптация research-llm-wiki: AEC-SCHEMA, raw/-снапшоты, разрешение противоречий) и согласовать — files: specs/wiki.md · verify: утверждена владельцем · dep: — · parallel: yes
- [ ] Реализовать skill `aec-wiki` по specs/wiki.md, включая lint-команду — files: skills/aec-wiki · verify: AC3 на эталонном проекте · dep: specs/wiki.md · parallel: no

### Phase 4 — Memory & remaining skills
- [ ] Реализовать MCP `aec-memory` (Mem0 embedded; scopes user/project) — files: mcp/aec_memory · verify: pytest: факт сохраняется и находится между сессиями · dep: Phase 0 · parallel: yes
- [ ] Написать specs/id-check.md и specs/docgen.md (+критерии smoke-эвалов) и согласовать — files: specs/ · verify: утверждены владельцем · dep: — · parallel: yes
- [ ] Реализовать skill `aec-id-check` + smoke-эвал ≥5 сценариев — files: skills/, eval/ · verify: AC4 (часть) · dep: specs/id-check.md · parallel: yes
- [ ] Реализовать skill `aec-docgen` + smoke-эвал ≥5 сценариев — files: skills/, eval/ · verify: AC4 (часть) · dep: specs/docgen.md · parallel: yes
- [ ] Реализовать языковые настройки: правило языка в SOUL-шаблоне, wiki_lang в настройках проекта, переключатель UI-locale (i18next en/ru) — files: runtime/, apps/desktop · verify: ручные проверки G7 · dep: — · parallel: yes

### Phase 5 — Packaging & field
- [ ] Собрать инсталлятор Windows (electron-builder; бандл Python-рантайма по образцу apps/desktop Hermes) — files: конфиги сборки · verify: AC1 на чистой машине · dep: Phases 0–4 · parallel: no
- [ ] Собрать macOS/Linux (best effort) — files: конфиги сборки · verify: запуск + smoke · dep: инсталлятор Win · parallel: yes
- [ ] Прогнать полный эвал и зафиксировать порог AC2 с владельцем — files: eval/ · verify: отчёт ≥ порога · dep: Phases 2–4 · parallel: yes
- [ ] Отполировать i18n en/ru по всем экранам — files: apps/desktop · verify: ручной проход обоих locale · dep: — · parallel: yes
- [ ] Провести полевые испытания: установка ≥2 инженерам, реальный проект, 2 недели, сбор обратной связи — files: NOTES.md → отчёт · verify: AC7 · dep: инсталлятор Win · parallel: no
- [ ] Написать пользовательскую документацию (README, quickstart ru/en) — files: README.md, docs пользователя · verify: skill docs-maintenance · dep: — · parallel: yes

## Blocked
- (пусто)

## Discovered
<!-- Subtasks found during work. -->
- (пусто)

## Done
- (пусто)
