# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 1 — Vault & sources: ЗАКРЫТА 2026-07-17 (1.0–1.20 Done+закоммичены; §Done).
Ручной прогон владельца 2026-07-17 дал фидбек → спланирована **Phase 1.5**
(Conformance & UX polish, TASKS §Active). Планировочные доки обновлены
(SPECIFICATION UR1, specs/workspace-sources.md, PLAN фаза 1.5, TASKS 1.5.*).
Phase 1.5 ОДОБРЕНА владельцем 2026-07-17 целиком (вкл. ресайз 1.5.9 и тему 1.5.10);
Obsidian-init подтверждён. Решения: checklists убрать; непустая папка = Obsidian;
баги сразу/остальное через гейт (гейт пройден); складка чата «как в Hermes» — позже.

## In flight / rollout (эта сессия)
- Готово+ревью, коммитится: 1.5.1 (reload.mcp add/remove, живой прогон), 1.5.3 (checklists).
- В работе: 1.5.2 (пустые tool-карточки, форензика, файлы чата — параллельно, disjoint).
- КООРДИНАЦИЯ ПО КОНТЕНЦИИ ФАЙЛОВ (index.ts/shell.css/Sidebar.tsx — горячие точки):
  Wave 1 (после коммита 1.5.1/1.5.3): 1.5.4 (Obsidian-init, Track A: index.ts+generator+
  диалоги) ∥ 1.5.10 (тема, disjoint: Settings/tokens/shell.css) ∥ 1.5.2 (чат).
  Wave 2 (после 1.5.4+1.5.10): Track B цепочкой на shell.css/Sidebar/index.ts —
  1.5.5 (источники в дереве, +IPC show-in-explorer для источника) → 1.5.6 (иконки+поиск)
  → 1.5.7 (ПКМ+Del) → 1.5.9 (ресайз) → 1.5.8 (тост CSS). Один редактор shell.css за раз.

## Ожидает владельца (не блокирует Phase 2, но входит в DoD фазы)
- Ручной прогон shell 1.0 (отмечен «ОЖИДАЕТСЯ» в TASKS §Done; общее «по ручному
  тестированию все ок» от 15.07 могло его покрывать — уточнить).
- Ручной прогон vault-дерева 1.6 (создать/rename/удалить в корзину/проводник).
- Ручной 9-шаговый прогон 1.20 (смена проекта: чат/источники/история) — шаги в
  отчёте оркестрации; + переключение во время стрима (обрыв старого агента ожидаем).
- BDD-чек-лист на реальной сетевой шаре (из спеки; UNC permission-denied не
  эмулируется тестами — Discovered 1.18).
- Команда на старт Phase 2 (Ingest & RAG) — первая задача 2.1 (Docling), потребует
  Vibe Diff на новые зависимости.

## Resume point (при обрыве сессии)
Phase 1 закрыта; следующий шаг — по команде владельца (Phase 2 / ручные прогоны).
Плейбук обрыва субагента лимитом — MEMORY.md (git status → свой verify → добор).

## Open threads (мелочь, не гейты)
- nit (0.9): в runtime/gateway-client.mjs id-префикс RPC захардкожен «smoke-» —
  править при следующем касании файла.
- Discovered в TASKS: format:check не входит в корневой lint (предложение владельцу);
  sync-обход ФС в main (1.8/1.18) → async/worker кандидат Phase 2+; reload.mcp рвёт
  все MCP-серверы (заметка для второго сервера); skip_reason дописать в спеку (1.13).
