# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 1 — Vault & sources, ОРКЕСТРАЦИЯ ИДЁТ (старт 2026-07-14 по команде владельца;
executor=sonnet, reviewer=opus→sonnet→инлайн). Done+закоммичено: 1.0–1.14, 1.17, 1.18
(1.14 — коммит 4536049 2026-07-16: CLI aec-rag scan + ScanScheduler + кнопка).
Осталось: 1.15 (in flight) → 1.19; независимые 1.16, 1.20. Гейты владельца сняты 15.07.

## In flight (эта сессия)
- 1.15 UI-уведомление об изменениях — executor диспетчеризован (потребляет scan:report
  из 1.14; действия re-ingest/вики — заглушки; ничего без подтверждения).
- Далее: ревью 1.15 → 1.16/1.20 → 1.19 (интеграционный тест цикла).

## Resume point (при обрыве сессии)
Продолжать оркестрацию Phase 1 по TASKS.md (Active/Blocked/Done — источник состояния).
Плейбук обрыва субагента лимитом — MEMORY.md (git status → свой verify → добор).
Правило владельца: после каждого логического блока — отметка в TASKS + коммит.

## Open threads (мелочь, не гейты)
- nit (0.9): в runtime/gateway-client.mjs id-префикс RPC захардкожен «smoke-» —
  править при следующем касании файла.
- Discovered в TASKS: format:check не входит в корневой lint (предложение владельцу);
  ChatMessage без стабильного id (key={index}) — закрыть при первом stateful-пузыре
  или в 1.0.
- В макетах пара англ. меток («Staleness») — локализовать при вёрстке 1.0.
