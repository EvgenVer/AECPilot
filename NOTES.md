# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 1 — Vault & sources: ОРКЕСТРАЦИЯ ЗАВЕРШЕНА 2026-07-17. Все 20 задач
(1.0–1.20) Done+закоммичены с ревью (последний коммит — 1.20, привязка чата к
проекту). Итог фазы и хронология — TASKS.md §Done; остаточные риски — §Discovered.

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
