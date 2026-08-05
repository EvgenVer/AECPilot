# TASKS — AECPilot
<!-- Atomic checklist. One concrete action per task, with a clear done-check.
     Atomic = single concrete action, no further planning needed.
     ID-формат: <фаза>.<номер>; dep указывает ID блокирующих задач. -->

> **Смена курса 2026-08-05.** Фазы 0–1.6 закрыты; их задачи удалены из этого файла
> намеренно (решение владельца: старые артефакты не должны попадать в контекст новой
> сессии). Выполненная работа — в git, стабильные факты — в `MEMORY.md`, поведенческие
> контракты — в `specs/`. Текущий курс — `PLAN.md` §«Смена курса».
>
> **Фазы перенумерованы 2026-08-05 так, чтобы порядок чтения = порядок выполнения.**
> Соответствие прежним номерам: догон объёма был 1.9 → **3**; вьюеры и вики были 3 → **4**;
> память и скилы были 4 → **5**; упаковка была 5 → **6**; доска и автоматизация были 6 →
> **7**. Фазы 1.7, 1.8 и 2 номера не меняли. Ни одна из перенумерованных фаз не
> выполнялась, поэтому в git и `AGENT_RUNS.md` старые номера не встречаются.

## Active

### Phase 1.7 — Ядро Hermes 0.20.0 (PLAN §Stack, решение D1)
<!-- Идёт первой: компоненты донора написаны против контрактов 0.20.0. -->
- [x] 1.7.1 Определить SHA коммита тега `v2026.8.3` и проверить, что тег указывает именно на него; записать `HERMES_SHA` (40 символов) рядом с `HERMES_VERSION="0.20.0"` — files: runtime/hermes-env.mjs · verify: `git ls-remote --tags` даёт тот же SHA; обе константы в файле · dep: — · parallel: no
- [x] 1.7.2 Переписать установку ядра на клон по `HERMES_SHA` + editable-установку с сохранением изолированных venv и HERMES_HOME; понятная ошибка, если в PATH нет git — files: runtime/setup.mjs · verify: установка проходит, `hermes --version` → `v0.20.0 (2026.8.3)`; повторный запуск идемпотентен · dep: 1.7.1 · parallel: no
  <!-- Формулировка задачи (`uv pip install "…@ git+…"`) не сработала: их build-backend
       отказывается собирать wheel/sdist в принципе ("Hermes is distributed via the shell
       installer, Docker image, or Nix") и предлагает только `-e`. Сделано так, как описано
       в PLAN §D1: shallow-клон ровно нужного коммита в `runtime/.hermes-src` (gitignored)
       + `uv pip install -e`. -->

- [x] 1.7.3 Выяснить, нужен ли ядру Node 26 в рантайме (релиз-ноты требуют его для их установщика/heal/upgrade, которыми мы не пользуемся): проверить запуск `hermes serve`, наши MCP-серверы и скилы на Node 24 — files: PLAN.md §Stack · verify: письменный вывод «нужен/не нужен»; при «нужен» — пин Node поднят и обосновано · dep: 1.7.2 · parallel: no
- [x] 1.7.4 Расширить снимальщик контракта на разрезанный шлюз (`tui_gateway/methods_{complete,config,prompt,session,tools}.py` + `server.py`) и на `hermes_cli/web_routers/*` вдобавок к монолиту `web_server.py`; снять слепок 0.20.0 — files: runtime/contract-snapshot.mjs, runtime/contracts/hermes-0.20.0.json · verify: в слепке число `@method` ≥ 123 и все пять модулей представлены; маршруты из `web_routers` присутствуют · dep: 1.7.2 · parallel: no
- [ ] 1.7.5 Написать сравниватель слепков: три раздела — «сломалось», «появилось», «**молча сменило умолчание**» (значение параметра по умолчанию изменилось при неизменной сигнатуре) — files: runtime/contract-diff.mjs, тест · verify: юнит-тест на синтетической паре слепков ловит все три категории; прогон 0.19.0→0.20.0 даёт отчёт · dep: 1.7.4 · parallel: no
- [ ] 1.7.6 Разобрать отчёт диффа по нашим поверхностям и завести задачу на каждое расхождение; отдельно ответить на четыре вопроса: появился ли серверный источник артефактов, получил ли `session.list` скоуп по рабочей папке, изменилось ли число `kind` у индикатора сжатия (микро-компакция каждый ход), изменился ли контракт подруливания — files: TASKS.md §Discovered · verify: по каждому пункту письменный ответ со ссылкой на модуль и имя метода · dep: 1.7.5 · parallel: no
- [ ] 1.7.7 Перепрогнать наши пробы на 0.20.0: `serve.mjs smoke`, `aec-sources-check`, `checkpoint-probe`, `skills-probe`, `profiles-probe`, `hermes-event-diff` — files: runtime/* · verify: все зелёные либо расхождение записано в 1.7.6 · dep: 1.7.2 · parallel: no
- [ ] 1.7.8 Проверить ловушку кэша MCP: в 0.20.0 серверы стартуют лениво из кэша схем по fingerprint — остаётся ли обязательным `reload.mcp confirm:true` при смене проекта — files: apps/desktop/src/main, MEMORY.md · verify: замер на двух проектах с разными источниками: агент не видит источники прежнего проекта · dep: 1.7.2 · parallel: no
- [ ] 1.7.9 Свести версии `mcp` и `starlette` между ядром (0.20.0 пиннит `mcp==1.28.1`, `starlette==1.3.1` из-за CVE-2026-48710) и корневым uv-workspace наших MCP-серверов — files: pyproject.toml, uv.lock · verify: в обоих окружениях `starlette` ≥ 1.0.1; расхождение версий осознано и записано · dep: 1.7.2 · parallel: yes
- [ ] 1.7.10 Перенаправить ссылки вида `tui_gateway/server.py:NNNN` в specs, MEMORY и комментариях на адресацию «модуль + имя метода» — files: specs/*, MEMORY.md, apps/desktop · verify: `grep -r "server.py:[0-9]"` по репозиторию пуст · dep: 1.7.4 · parallel: yes
- [ ] 1.7.11 Удалить отработавшие планировочные артефакты: `docs/decisions-phase-1.6-batches.md`, `docs/parity-approvals.md` — files: docs/ · verify: файлы удалены; ни один документ на них не ссылается · dep: — · parallel: yes
- [ ] 1.7.12 Удалить слепок `runtime/contracts/hermes-0.19.0.json` после разбора диффа — files: runtime/contracts · verify: остался только слепок 0.20.0 · dep: 1.7.6 · parallel: no
- [ ] 1.7.13 Прогнать полный набор проверок на обновлённом ядре и зафиксировать — files: — · verify: vitest, e2e, pytest, lint/tsc/prettier/ruff зелёные · dep: 1.7.6, 1.7.7 · parallel: no

### Phase 1.8 — Миграция рендерера на стек донора (PLAN §Слой донора, решения D2/D3/D5)

**Фундамент**
- [ ] 1.8.1 ⚠️ ГЕЙТ ЗАВИСИМОСТЕЙ: провести `dependency-vetting` по `tailwindcss` v4, `@tailwindcss/vite`, `clsx`, `class-variance-authority`, `tailwind-merge`, `nanostores`, `@nanostores/react`, `@tanstack/react-query`, `@vscode/codicons` (реестр, репозиторий, сопровождение, лицензия, установочные скрипты, вес) и оформить Vibe Diff → **STOP до «go» владельца** — files: PLAN.md §Selected dependencies · verify: отчёт по каждому пакету; ни одна установка не выполнена до «go» · dep: — · parallel: no
- [ ] 1.8.2 Установить утверждённый стек точными версиями; Radix-примитивы **не ставить пачкой** — по одному при первом использовании — files: apps/desktop/package.json, pnpm-lock.yaml · verify: `pnpm build` проходит; `npm audit` чист; лицензии permissive (C3) · dep: 1.8.1 · parallel: no
- [ ] 1.8.3 Зафиксировать точку съёмки донора: `DONOR_SHA` + версия их десктопа; перевести локальный клон `D:\my program\Hermes\hermes-agent` на этот коммит (read-only) — files: runtime/donor-env.mjs · verify: константа записана; `git -C <клон> rev-parse HEAD` совпадает · dep: — · parallel: yes
- [ ] 1.8.4 Завести зону `renderer/src/donor/` и записать правила переноса в `AGENTS.md`: заголовок происхождения (путь + `DONOR_SHA` + MIT + перечень правок) и **ровно четыре разрешённые правки** — files: apps/desktop/src/renderer/src/donor/README.md, AGENTS.md · verify: правила читаемы; шаблон заголовка приведён · dep: 1.8.3 · parallel: yes
- [ ] 1.8.5 Реализовать адаптер их клиента шлюза (`@/hermes`) на наш IPC-мост, не открывая WebSocket из рендерера (SPEC C9) — files: apps/desktop/src/renderer/src/shared/gateway-bridge.ts · verify: компонентный тест: вызов RPC уходит в мост; в бандле рендерера нет `new WebSocket` к шлюзу · dep: 1.8.2 · parallel: no
- [ ] 1.8.6 Перевести локализацию на их форму (каталоги `en`/`ru` + `useI18n`), снять `i18next` — files: apps/desktop/src/renderer/src/shared/i18n/* · verify: переключение языка работает на двух экранах; `i18next` отсутствует в зависимостях · dep: 1.8.2 · parallel: no
- [ ] 1.8.7 Подключить их тему как есть (Tailwind v4 + их CSS-переменные + Codicon) — files: apps/desktop/src/renderer/src/shared/theme/* · verify: светлая и тёмная темы переключаются; `color-scheme` следует теме (иначе Chromium рисует хромировку из светлой палитры) · dep: 1.8.2 · parallel: no
- [ ] 1.8.8 Удалить наш дизайн-слой: `design/screens/*`, `design/tokens.css`, `design/tokens.json`, `design/DESIGN_BRIEF.md` — files: design/ · verify: каталог удалён; ни один документ и ни один импорт на него не ссылается · dep: 1.8.7 · parallel: no

**Перенос экранов** (каждая задача: перенести → подключить к мосту → удалить наш заменённый код в том же коммите)
- [ ] 1.8.9 Чат: лента, композер, карточки инструментов и рассуждения, подагенты, MoA — files: donor/app/chat/**, удалить renderer/src/chat/** · verify: `specs/agent-chat.md` проходит по сценариям; перенесённые тесты донора зелёные; наш `chat/` удалён кроме `*-pure.ts` · dep: 1.8.5, 1.8.6, 1.8.7 · parallel: no
- [ ] 1.8.10 Настройки: провайдеры, модели, инструменты и доступы, MCP-серверы, шлюз, плагины — files: donor/app/settings/**, удалить renderer/src/settings/** · verify: ключи по-прежнему только в safeStorage (правило R2); `POST /api/env/reveal` и `model.save_key` не вызываются нигде · dep: 1.8.9 · parallel: no
- [ ] 1.8.11 Сессии, детали сессии, профили, палитра команд, статус-бар — files: donor/app/session/**, donor/app/profiles/**, donor/app/command-palette/**, удалить соответствующие наши файлы · verify: `specs/agent-sessions.md` проходит; привязка сессий к проекту сохранена · dep: 1.8.9 · parallel: no
- [ ] 1.8.12 Скилы, обучение, куратор — files: donor/app/skills/**, donor/app/learning/**, удалить renderer/src/shell/SkillsPanel*, LearningPanel* · verify: `specs/agent-skills.md` проходит · dep: 1.8.9 · parallel: no
- [ ] 1.8.13 Артефакты и Карта обучения — files: donor/app/artifacts/**, donor/app/starmap/**, удалить renderer/src/artifacts/**, renderer/src/starmap/** · verify: `specs/external-surfaces.md` проходит; наш перенесённый `render.ts` заменён их актуальным · dep: 1.8.9 · parallel: no
- [ ] 1.8.14 Терминал агента, фоновые процессы, уведомления — files: donor/app/right-sidebar/**, удалить renderer/src/shell/TerminalTab*, ProcessesTab*, Toasts* · verify: `specs/workbench-panels.md` проходит; ответ на `terminal.read.request` уходит всегда (иначе агент стоит 30 с) · dep: 1.8.9 · parallel: no
- [ ] 1.8.15 Оболочка: их система размещения панелей, вкладки сессий, статус-бар, тайтл-бар (UR12) — files: donor/app/shell/**, удалить renderer/src/shell/{Shell,CenterArea,BottomPanel,PanelResizer,Rail,TopBar,StatusBar}* · verify: все границы тянутся, размеры переживают перезапуск; двойной клик по разделителю сбрасывает размер · dep: 1.8.9 · parallel: no
- [ ] 1.8.16 Чекпойнты и экран отката (UR14) на их стеке; донора у экрана нет — пишем сами против `rollback.*` — files: renderer/src/aec/rollback/** · verify: `specs/checkpoints-rollback.md` проходит; маркер чекпойнтов в корне хранилища на месте · dep: 1.8.15 · parallel: no

**Наши поверхности** (донора нет — переносим стиль, не код)
- [ ] 1.8.17 Проводник vault + источники (react-arborist) на стеке донора — files: renderer/src/aec/explorer/** · verify: `specs/workspace-sources.md` UR2-сценарии; ПКМ-меню, Del, поиск, «показать в проводнике» работают · dep: 1.8.15 · parallel: no
- [ ] 1.8.18 Welcome, диалог создания проекта, меню проекта, тост сканов — files: renderer/src/aec/project/** · verify: init в непустой папке не трогает существующие файлы; тост изменений появляется · dep: 1.8.17 · parallel: no
- [ ] 1.8.19 Удалить остаток нашего стилевого слоя `renderer/src/styles/**` и осиротевшие импорты — files: apps/desktop · verify: сборка проходит; `grep -r "styles/"` по рендереру пуст · dep: 1.8.18 · parallel: no

**Закрытие фазы**
- [ ] 1.8.20 Написать новый ручной чек-лист приёмки под мигрированный интерфейс и удалить `docs/manual-checklist-phase-1.5.md` и `docs/manual-checklist-phase-1.6.md` — files: docs/manual-checklist.md · verify: чек-лист покрывает все перенесённые экраны и наши поверхности; старые файлы удалены · dep: 1.8.19 · parallel: no
- [ ] 1.8.21 Прогнать полный набор проверок и сборку; сверить дельту бандла с прежней — files: — · verify: vitest (вкл. перенесённые тесты донора), e2e, pytest, lint/tsc/prettier/ruff зелёные; размер бандла записан · dep: 1.8.20 · parallel: no
- [ ] 1.8.22 Ручная приёмка владельцем одним прогоном по новому чек-листу — files: — · verify: владелец сообщил только замечания; замечания закрыты · dep: 1.8.21 · parallel: no

### Phase 2 — Ingest & RAG, эталонный сценарий (спека: specs/qa-over-sources.md)
<!-- Python-часть (2.1–2.12, 2.16–2.19) от миграции интерфейса не зависит и может идти
     параллельно фазе 1.8. UI-задачи 2.13–2.15 садятся на мигрированную оболочку. -->
- [ ] 2.1 Подключить Docling: text-PDF → markdown с постраничным locator — files: mcp/aec_rag · verify: pytest на образце (страницы в мета) · dep: — · parallel: yes
- [ ] 2.2 Прогнать замер OCR-движков Docling на ≥5 реальных ru-сканах, выбрать дефолт (R4) — files: eval/ocr-report.md, PLAN.md §Risks · verify: таблица результатов + решение записано · dep: 2.1 · parallel: yes
- [ ] 2.3 Включить OCR-путь для скан-PDF с выбранным движком — files: mcp/aec_rag · verify: pytest скан-фикстура (текст+страницы) · dep: 2.2 · parallel: no
- [ ] 2.4 Подключить DOCX → markdown (+заголовки как locator-кандидаты) — files: mcp/aec_rag · verify: pytest образец · dep: 2.1 · parallel: yes
- [ ] 2.5 Подключить XLSX/CSV → таблицы (locator: лист/диапазон) — files: mcp/aec_rag · verify: pytest образец · dep: 2.1 · parallel: yes
- [ ] 2.6 Реализовать чанкер поверх markdown (заголовки/размер; таблицы целиком; locator в мета) — files: mcp/aec_rag · verify: юниты на границы чанков · dep: 2.1 · parallel: yes
- [ ] 2.7 Решить O4: формат locator и открытия места для DOCX/XLSX (мини-прототип, фиксация в спеке) — files: specs/qa-over-sources.md · verify: спека обновлена, владелец подтвердил · dep: 2.4, 2.5 · parallel: yes
- [ ] 2.8 Инициализировать LightRAG per-project (.aecpilot/, embedded-хранилища, embedding-модель из настроек) — files: mcp/aec_rag · verify: индекс создаётся в .aecpilot/ · dep: 2.6 · parallel: no
- [ ] 2.9 Реализовать инкрементальный ingest по index.db + наполнение FTS5 текстом — files: mcp/aec_rag · verify: pytest: повторный ingest без дублей; FTS находит фразу · dep: 2.8 · parallel: no
- [ ] 2.10 Реализовать MCP-инструмент rag_ingest (джоб + события прогресса) — files: mcp/aec_rag · verify: контрактный тест по спеке · dep: 2.9 · parallel: no
- [ ] 2.11 Реализовать rag_status и rag_query (top_k, фильтры, locator в результатах) — files: mcp/aec_rag · verify: контрактные тесты по спеке · dep: 2.10 · parallel: no
- [ ] 2.12 Написать skill aec-qa (только rag_query, формат [src:…], «не найдено», противоречащие редакции) и зарегистрировать — files: skills/aec-qa · verify: ручной прогон 8 BDD-сценариев спеки · dep: 2.11 · parallel: no
- [ ] 2.13 Реализовать парсер цитат [src:…] в чате → кликабельные ссылки — files: apps/desktop · verify: юнит парсера (вкл. кривые ссылки) · dep: 2.12, 1.8.9 · parallel: no
- [ ] 2.14 Реализовать минимальный PDF-вьюер (pdfjs): открыть файл, перейти к странице из цитаты — files: apps/desktop/src/renderer/src/aec/viewers · verify: клик из цитаты открывает нужную страницу (ядро AC1) · dep: 2.13 · parallel: no
- [ ] 2.15 Показать прогресс ingest и rag_status в UI (статус индекса, устаревшие) — files: apps/desktop · verify: ручной прогон + UR8 · dep: 2.10, 1.8.15 · parallel: yes
- [ ] 2.16 Составить эвал-датасет ≥30 вопросов (типы factual/table/scan/negative/injection) + раннер (LLM-judge, отчёт) — files: eval/qa_dataset.yaml, eval/runner · verify: датасет валиден, раннер отчитывается на 3 пробных вопросах · dep: 2.12 · parallel: yes
- [ ] 2.17 Снять baseline эвала и предложить владельцу порог (O1) — files: eval/reports/ · verify: baseline-отчёт сохранён, порог предложен · dep: 2.16 · parallel: no
- [ ] 2.18 Прогнать нагрузочную проверку A3/R3 (объём эталонного проекта ×2) — files: eval/load-report.md, PLAN.md · verify: отчёт с числами, выводы внесены · dep: 2.11 · parallel: yes
- [ ] 2.19 Прогнать security-review поверхностей: пути, RO, инъекции, хранение ключей, каталог плагинов ядра (R11), внешние каналы (R10) — files: отчёт в AGENT_RUNS.md · verify: критичных находок нет либо устранены · dep: 2.14 · parallel: yes

### Phase 3 — Догон объёма (SPEC UR13: всё, кроме §Non-Goals)
<!-- Была 1.9. Идёт после Phase 2: RAG — причина существования продукта, а догон велик и
     его позиции можно вытягивать поштучно. -->
- [ ] 3.1 Написать генератор реестра паритета: возможности ядра и поверхности донора против наших вкладов и списка исключений SPEC — files: runtime/parity-registry.mjs · verify: отчёт делится на «есть у нас», «исключено (со ссылкой на HX)», «расхождение»; раздел расхождений разобран построчно (AC9) · dep: 1.7.4 · parallel: no
- [ ] 3.2 Атомизировать позиции, которые добавит реестр сверх перечисленных ниже — files: TASKS.md · verify: на каждое расхождение из 3.1 есть задача либо запись в §Non-Goals с основанием · dep: 3.1 · parallel: no
- [ ] 3.3 История изменений (UR16): diff-вьюер и панель «что агент изменил в моих документах», без веток/worktree/коммитов (HX6) — files: donor/app/right-sidebar/review/**, renderer/src/aec/ · verify: изменение агента видно построчно и отменяется; git-понятия в интерфейсе не появляются · dep: 1.8.22 · parallel: yes
- [ ] 3.4 Предпросмотр артефактов в песочнице (UR22) — files: donor/app/chat/right-rail/** · verify: HTML-артефакт отображается; `contextIsolation`/`sandbox` окна не ослаблены (SPEC C9) · dep: 1.8.22 · parallel: yes
- [ ] 3.5 Расписания (UR18): экран задач cron на их коде — files: donor/app/cron/** · verify: задача создаётся, редактируется, отключается; видна история запусков · dep: 1.8.22 · parallel: yes
- [ ] 3.6 Решить O6 — хост тика расписаний: замерить на 0.20.0, тикает ли планировщик под `hermes serve`; варианты — их гейтвей рядом, свой тик, планировщик ОС — files: PLAN.md · verify: замер и решение записаны с ценой каждого варианта; при отсутствии тика UI честно сообщает ограничение · dep: 3.5 · parallel: no
- [ ] 3.7 Голосовой режим (UR21): разговор с перебиванием, слова-активаторы — files: donor/app/voice/** · verify: микрофон включается только явным действием и виден индикатором; отключение работает · dep: 1.8.22 · parallel: yes
- [ ] 3.8 Хаб скилов (UR23) с политикой доверия: перед установкой показано, что скил делает и какие инструменты требует — files: donor/app/skills/hub.tsx · verify: установка невозможна без явного подтверждения; список требуемых инструментов виден · dep: 1.8.22 · parallel: yes
- [ ] 3.9 Внешние каналы (UR19), часть 1: экран состояния каналов, выключены по умолчанию — files: donor/app/messaging/** · verify: в чистой поставке все каналы выключены; включение требует явного действия (AC10) · dep: 1.8.22 · parallel: no
- [ ] 3.10 Внешние каналы, часть 2: показ того, какие данные уходят наружу при включении канала — files: renderer/src/aec/channels-disclosure/** · verify: перед включением показан перечень: содержимое диалога, доступ к файлам проекта, возможность запуска агента снаружи (R10) · dep: 3.9 · parallel: no
- [ ] 3.11 Внешние каналы, часть 3: подписанные исходящие вебхуки и A2A v1.0 — files: donor/app/messaging/**, settings · verify: подпись HMAC проверяется получателем; A2A-обмен проходит на тестовом партнёре · dep: 3.10 · parallel: no
- [ ] 3.12 Удалённый режим (UR20), часть 1: подключение к чужому `hermes serve`, токен в safeStorage — files: donor/app/gateway/**, main/ · verify: подключение работает; токен не виден рендереру и не лежит в `settings.json` · dep: 1.8.22 · parallel: no
- [ ] 3.13 Удалённый режим, часть 2: провести каждую файловую поверхность (проводник, чекпойнты, артефакты, вложения, сканер) через выбор «работает удалённо / честно отключена с объяснением» — files: renderer/src/aec/**, main/ · verify: ни одна поверхность не молчит; для каждой записано решение (R13) · dep: 3.12 · parallel: no
- [ ] 3.14 Окна и размещение: несколько окон, плавающие панели, виджет-грид, вкладки сессий — files: donor/app/shell/**, electron/ · verify: окно открывается по Ctrl+Shift+N; панель отрывается и возвращается; раскладка переживает перезапуск · dep: 1.8.22 · parallel: yes
- [ ] 3.15 Быстрый ввод по глобальному хоткею — files: donor/electron/quick-entry.ts · verify: хоткей вызывает окно поверх других приложений; сообщение уходит в выбранную сессию · dep: 3.14 · parallel: yes
- [ ] 3.16 Поиск по странице (Ctrl+F по ленте), разделители сессий по датам, раздел закреплённых сессий, кликабельные ссылки на сессии — files: donor/app/chat/**, donor/app/session/** · verify: каждая из четырёх позиций проверена вручную · dep: 1.8.22 · parallel: yes
- [ ] 3.17 Композер: история отмены, вставленные ссылки как элементы, прикрепление файлов и папок через нативный диалог, склад черновиков — files: donor/app/chat/composer/** · verify: Ctrl+Z в поле ввода откатывает; вставленная ссылка становится элементом; диалог выбора прикрепляет файл и папку · dep: 1.8.22 · parallel: yes
- [ ] 3.18 Keep awake (не давать машине уснуть на ночных прогонах) — files: donor/electron/ · verify: при включённом режиме машина не засыпает, экран гаснуть может · dep: 1.8.22 · parallel: yes
- [ ] 3.19 Вход через системный браузер для OAuth провайдеров LLM — files: donor/electron/native-oauth*, main/ · verify: ключ приезжает в safeStorage без ручного ввода в поле; правило R2 не нарушено · dep: 1.8.22 · parallel: yes
- [ ] 3.20 Мастер первого запуска (онбординг) под наш продукт — files: renderer/src/aec/onboarding/** · verify: чистая установка доводит инженера-непрограммиста до первого ответа агента без терминала · dep: 1.8.22 · parallel: yes
- [ ] 3.21 Механизм автообновления на нашем канале релизов — files: donor/electron/update-*, конфиг сборки · verify: проверка обновления смотрит на наш канал; их канал не используется нигде (HX4) · dep: 6.2 · parallel: no
- [ ] 3.22 Скил `grounded-citations` из 0.20.0: оценить пригодность для `aec-qa` (цитаты, сверяемые с текстом источника) и решить — брать как есть, адаптировать или не брать — files: skills/, eval/ · verify: письменное решение с замером на 5 вопросах эталонного набора · dep: 2.17 · parallel: no
- [ ] 3.23 Отражение изменений ядра 0.20.0 в интерфейсе: пер-ходовая микро-компакция (индикатор сжатия не должен мигать), лимит итераций 90→500, самовосстановление инструментов (усечённый вывод в файл), `hermes approvals suggest` и размыкатель по серии отказов — files: donor/app/**, renderer/src/aec/ · verify: по каждой из пяти позиций письменный вывод «показываем так / не показываем и почему» · dep: 1.7.6 · parallel: yes

### Phase 4 — Viewers & wiki (была 3; спека: specs/wiki.md)
- [ ] 4.1 Довести PDF-вьюер: вкладки, поиск по тексту, зум — files: apps/desktop · verify: AC8-прогон PDF (вкл. битый файл → понятная ошибка) · dep: 2.14 · parallel: yes
- [ ] 4.2 Реализовать DOCX-вьюер (docx-preview) и TXT-просмотр — files: apps/desktop · verify: AC8-прогон DOCX/TXT · dep: 2.14 · parallel: yes
- [ ] 4.3 Реализовать XLSX/CSV-вьюер (Univer, read-only) — files: apps/desktop · verify: AC8-прогон XLSX/CSV (вкл. большой файл) · dep: 2.14 · parallel: yes
- [ ] 4.4 Реализовать открытие DOCX/XLSX по locator из цитат (по решению O4) — files: apps/desktop · verify: клик из цитаты открывает место · dep: 4.2, 4.3, 2.7 · parallel: no
- [ ] 4.5 Встроить MD-редактор (Milkdown): рендер+правка файлов vault, автосохранение — files: apps/desktop · verify: правка сохраняется, undo работает · dep: 1.8.18 · parallel: yes
- [ ] 4.6 Реализовать wikilinks в MD-редакторе: навигация [[…]], создание страницы по клику — files: apps/desktop · verify: ручной прогон навигации · dep: 4.5 · parallel: no
- [ ] 4.7 Реализовать генератор wiki/-структуры и дефолтной AEC-SCHEMA.md — files: mcp/aec_rag или runtime/templates · verify: юнит: структура по specs/wiki.md · dep: — · parallel: yes
- [ ] 4.8 Реализовать skill aec-wiki: операция build (страницы, frontmatter, провенанс, raw/-снапшоты, index/log) — files: skills/aec-wiki · verify: BDD «Первичное построение» · dep: 4.7, 2.12 · parallel: no
- [ ] 4.9 Реализовать операцию update (инкрементально; противоречия — явными блоками) — files: skills/aec-wiki · verify: BDD «Инкрементальное обновление» · dep: 4.8 · parallel: no
- [ ] 4.10 Обеспечить сохранение ручных правок при update — files: skills/aec-wiki · verify: BDD «Ручная правка сохраняется» · dep: 4.9 · parallel: no
- [ ] 4.11 Реализовать lint вики (битые ссылки, сироты, staleness, frontmatter, незакрытые противоречия) — files: skills/aec-wiki, mcp/aec_rag · verify: pytest-фикстуры дефектов + BDD «Lint» · dep: 4.8 · parallel: yes
- [ ] 4.12 Реализовать query по вики (обзорные ответы со ссылками на страницы) — files: skills/aec-wiki · verify: BDD «Query» · dep: 4.8 · parallel: yes
- [ ] 4.13 Связать детект изменений с вики: действие «обновить вики» из уведомления — files: apps/desktop · verify: сквозной прогон изменение→уведомление→подтверждение→update · dep: 4.9 · parallel: no
- [ ] 4.14 Прогнать smoke-эвал aec-wiki (≥5 сценариев) — files: eval/ · verify: отчёт соответствует критериям спеки · dep: 4.10 · parallel: yes
- [ ] 4.15 Прогнать AC3 на эталонном проекте — files: отчёт в AGENT_RUNS.md · verify: чек-лист AC3 полностью · dep: 4.11, 4.12 · parallel: no

### Phase 5 — Memory & remaining skills (была 4; спеки: specs/agent-memory.md — переписывается 5.0, specs/docgen.md)
- [ ] 5.0 Переработать `specs/agent-memory.md` под двухслойную модель: что в записке ядра, что в расширенной памяти, инструменты агента, скоупы user/project — files: specs/agent-memory.md · verify: сценарии переписаны под два слоя; владелец подтвердил · dep: — · parallel: yes
- [ ] 5.1 ⚠️ ГЕЙТ ЗАВИСИМОСТЕЙ: замерить провайдер Mem0 локально — вес пакета и хранилища, стоимость извлечения фактов, работа без сети; `dependency-vetting` + Vibe Diff → **STOP до «go»** — files: PLAN.md, eval/memory-report.md · verify: числа в отчёте; решение «берём/не берём» записано · dep: 5.0 · parallel: no
- [ ] 5.2 Подключить провайдер памяти в профиле и развести скоупы user/project — files: runtime/dev-profile, runtime/setup.mjs · verify: факт из проекта A не всплывает в проекте B; персистентность после рестарта · dep: 5.1 · parallel: no
- [ ] 5.3 Фильтр секретов до записи в память — files: runtime/ или mcp/ по итогам 5.0 · verify: pytest на диалогах-фикстурах; секреты не сохраняются ни в одном слое · dep: 5.2 · parallel: no
- [ ] 5.4 Экран памяти: записка ядра правится текстом, расширенная память — список с поиском и удалением — files: apps/desktop · verify: BDD «Управление памятью» · dep: 5.2, 1.8.22 · parallel: no
- [ ] 5.5 Recall: правило сверки с памятью в шаблоне проектного AGENTS.md — files: runtime/templates · verify: ручной сценарий «факт из прошлой сессии влияет на ответ» · dep: 5.2 · parallel: yes
- [ ] 5.6 Прогнать smoke-эвал памяти (≥5 сценариев) — files: eval/ · verify: отчёт по критериям · dep: 5.5 · parallel: yes
- [ ] 5.10 Реализовать механизм шаблонов docgen: парсер manifest.yaml + рендер DOCX (docxtpl) + маркировка «НЕ НАЙДЕНО» — files: mcp или skills · verify: юнит подстановки, стили сохранены · dep: — · parallel: yes
- [ ] 5.11 Реализовать skill aec-docgen (сбор → заполнение → drafts/ + report.md с провенансом) — files: skills/aec-docgen · verify: BDD-сценарии спеки · dep: 5.10, 2.12 · parallel: no
- [ ] 5.12 Подготовить референс-шаблон ПЗ с владельцем и прогнать на эталонном проекте — files: templates-пример, eval/ · verify: черновик собирается, отчёт корректен · dep: 5.11 · parallel: no
- [ ] 5.13 Прогнать smoke-эвал aec-docgen (≥5; «0 выдуманных значений») — files: eval/ · verify: отчёт (AC4) · dep: 5.12 · parallel: yes
- [ ] 5.14 Реализовать языковые настройки: правило языка в SOUL-шаблоне, wiki_lang в настройках проекта, переключатель UI-locale (их i18n, en/ru) — files: runtime/, apps/desktop · verify: ручные проверки G7 (три уровня языка) · dep: 1.8.6 · parallel: yes

### Phase 6 — Packaging & field (была 5)
- [ ] 6.1 Изучить упаковку их десктопа (бандл Python) и зафиксировать нашу стратегию — files: PLAN.md · verify: решение записано в PLAN · dep: Phases 1.7–5 функционально готовы · parallel: no
- [ ] 6.2 Настроить electron-builder для Windows с бандлом рантаймов (Node app + Python venv + модели Docling) — files: конфиги сборки · verify: инсталлятор ставится на чистую VM · dep: 6.1 · parallel: no
- [ ] 6.3 Собрать колесо ядра из зафиксированного SHA один раз и записать его хэш (офлайн-воспроизводимость поставки) — files: runtime/, PLAN.md · verify: установка из сохранённого колеса даёт ту же версию; хэш записан · dep: 6.2 · parallel: yes
- [ ] 6.4 Прогнать AC1 на чистой машине — files: отчёт в AGENT_RUNS.md · verify: чек-лист AC1 · dep: 6.2 · parallel: no
- [ ] 6.5 Собрать macOS/Linux (best effort) — files: конфиги сборки · verify: запуск + smoke на каждой платформе · dep: 6.2 · parallel: yes
- [ ] 6.6 Прогнать полный эвал всех скиллов и зафиксировать порог AC2 с владельцем — files: eval/reports/ · verify: отчёт ≥ порога; порог записан в SPECIFICATION (закрытие O1) · dep: 2.17, 4.14, 5.13 · parallel: yes
- [ ] 6.7 Отполировать i18n en/ru по всем экранам, включая строки, приехавшие с кодом донора — files: apps/desktop · verify: ручной проход обоих locale; непереведённых ключей нет · dep: 5.14 · parallel: yes
- [ ] 6.8 Провести полевые испытания: установка ≥2 инженерам, реальный проект, 2 недели, канал обратной связи, отчёт — files: AGENT_RUNS.md · verify: AC7 + отчёт с находками · dep: 6.4 · parallel: no
- [ ] 6.9 Написать пользовательскую документацию (README, quickstart ru/en) — files: README.md, docs пользователя · verify: проверка по skill docs-maintenance · dep: 6.4 · parallel: yes
- [ ] 6.10 Финальная сверка: SPECIFICATION/PLAN/TASKS актуальны, AC1–AC10 сведены в отчёт — files: планировочные файлы · verify: consistency-review пройден · dep: все · parallel: no

### Phase 7 — Board & desktop automation (была 6; post-MVP)
<!-- Не берётся в работу до закрытия MVP. Объём намеренно крупный; атомизация — когда
     фаза начнётся. Ключевой факт для оценки — MEMORY.md §Канбан. -->
- [ ] 7.1 Канбан-доска агентов (SPEC N10): разметка поверх их HTTP-API плагина, создание/связи/история, запуск задачи в сессию — files: apps/desktop · verify: задача создаётся и берётся в работу · dep: MVP закрыт · parallel: no
- [ ] 7.2 Решить хост автораздачи: их `hermes gateway` рядом, свой периодический вызов `/dispatch` либо доска без автораздачи — files: PLAN.md · verify: решение записано с ценой каждого варианта · dep: 7.1 · parallel: no
- [ ] 7.3 Command Center и агенты — files: apps/desktop · verify: по спеке фазы · dep: 7.1 · parallel: no
- [ ] 7.4 UR15 шаг 1 — проверка осуществимости управления компьютером: поставить драйвер на Windows, прогнать на реальном расчётном комплексе, измерить точность попадания и расход токенов — files: eval/computer-use-report.md · verify: отчёт с числами и вердикт «идём дальше / нет»; **до отчёта объём не фиксируется** · dep: MVP закрыт · parallel: yes
- [ ] 7.5 UR15 шаг 2 — по результату 7.4: режим подтверждений, экран состояния драйвера, границы допустимых действий — files: PLAN.md, apps/desktop · verify: решение владельца записано; экран проходит ручной прогон · dep: 7.4 · parallel: no

## Blocked
- (пусто)

## Deferred (post-MVP)
<!-- Выведено из скоупа MVP решением владельца; возврат — через planning gate. -->
- aec-id-check целиком (решение владельца 2026-07-08, SPECIFICATION N9; spec заморожена — specs/id-check.md).
  - 5.D1 Парсер/валидатор чек-листа + дефолтный id-checklist.yaml в генераторе vault
  - 5.D2 Skill aec-id-check: комплектность по чек-листу
  - 5.D3 Поиск противоречий (нормализация единиц, серьёзность)
  - 5.D4 Smoke-эвал aec-id-check

## Discovered
<!-- Subtasks found during work. Записи, привязанные к удалённым экранам, сняты 2026-08-05:
     их предмет исчезает вместе с нашим кодом. -->
- [ ] D-1 Виды `status.update` `lifecycle` и `warn` нигде не показываются. Оба несут человеку адресованный текст: `warn` — деградации побочных путей («сжатие не удалось», «память не записалась»), `lifecycle` — «превышено число повторов», «кончились кредиты». Нужен замер частоты на живом прогоне: без него показ превратится в шум · dep: 1.8.9 · оценка: S
- [ ] D-2 Событие `tool.output_risk` (с 0.19.0) игнорируется намеренно — их эвристическое предупреждение о содержимом вывода инструмента. Нужен разбор: что в payload и есть ли действие для пользователя · dep: 1.7.6 · оценка: S
- [ ] D-3 «Язык агента» — настройка без потребителя: SPEC G7/UR4 требуют её, но поля нет ни в `project.json`, ни в RPC ядра. Единственное осмысленное место — шаблон `runtime/templates/AGENTS.md`; требует ревью содержимого шаблона с владельцем · dep: 5.14 · оценка: S
- [ ] D-4 Блок ручного чек-листа «источник на UNC-шаре» (скан, дерево, отказ в правах) вживую не проверялся — доступной сетевой шары не было. Смыкается с дырой покрытия: достижимая-но-запрещённая шара тестами не эмулируется. Проверить при первой возможности либо на полевых испытаниях (6.8) · dep: — · оценка: S
- [ ] D-5 Гейт-пробел: корневой `lint` = eslint+tsc+ruff, но не `prettier --check` — формат-дрейф проскакивает. Предложение: добавить `format:check` в `lint` · dep: — · оценка: S
- [ ] D-6 async-тесты `mcp/` держатся на pytest-плагине anyio, приходящем транзитивно из `mcp`; если плагин окажется неактивным, async-тесты дадут ложный pass. Предложение: объявить anyio явно в dev-группе корневого pyproject либо включить `filterwarnings=error` · dep: — · оценка: S
- [ ] D-7 Колонка `skip_reason` (too_large|unreadable) есть в схеме `index.db`, но не описана в перечне колонок `specs/workspace-sources.md` §Data schemas — микроправка спеки, поведения не меняет · dep: — · оценка: XS
- [ ] D-8 Файловые операции над источниками синхронны (`readdirSync`/`statSync`) в main-процессе: на мёртвой UNC-шаре блокируют main до сетевого таймаута ОС. Кандидат на async-обход или worker-поток · dep: — · оценка: M
- [ ] D-9 `index.db` открывается с `busy_timeout=0` — ручной `aec-rag scan` параллельно с приложением даст «database is locked» и упавший скан (не порча: commit атомарен). При жалобах — PRAGMA busy_timeout · dep: — · оценка: XS
- [ ] D-10 Журнал `.aecpilot/logs/sources-rejected.jsonl` растёт без ротации. Завести лимит при росте нагрузки · dep: — · оценка: XS
- [ ] D-11 `project:create` доверяет абсолютному пути от рендерера: скомпрометированный рендерер может создать пустое дерево каталогов в произвольном записываемом месте (перезапись существующих файлов невозможна by construction). Гард `path.isAbsolute` есть. Пересмотреть при security-review (2.19) · dep: 2.19 · оценка: S
- [ ] D-13 Первый старт `hermes serve` после установки не укладывается в 30 с `waitHealthy`: editable-установка отдаёт ядро исходниками, и первый запуск компилирует байткод всего дерева (замер 1.7.3: первый прогон `serve.mjs smoke` упал по таймауту, второй прошёл за секунды). На чистой установке у пользователя это будет первый запуск приложения. Варианты: прогреть `python -m compileall` в `setup.mjs` либо поднять таймаут первого старта · dep: — · оценка: S
- [ ] D-12 При падении записи на полпути в предсуществовавшую пустую папку отката нет — остаются частичные файлы, повторная попытка упрётся в «не пуста» · dep: — · оценка: S

## Done
Фазы **0** (каркас, шлюз, чат), **1** (vault, источники, MCP `aec-sources`, индексер),
**1.5** (conformance и UX), **1.6** (паритет с Hermes Desktop: чат, настройки, скилы,
сессии, панели, внешние поверхности, чекпойнты, layout) — закрыты и закоммичены.
Итог на 2026-08-04: vitest 1230, e2e 4/4, pytest 129, сборка проходит.

Задачи этих фаз удалены из файла решением владельца 2026-08-05 (смена курса): подробности
работы — в git, продолжающие быть верными факты — в `MEMORY.md`, поведенческие контракты —
в `specs/`. **Рендерер фазы 1.6 заменяется в фазе 1.8** — эта работа была ступенью к
пониманию их контрактов, а не конечным кодом.
