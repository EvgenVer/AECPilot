# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 1 — Vault & sources, ОРКЕСТРАЦИЯ ИДЁТ (старт 2026-07-14 по команде владельца;
executor=sonnet, reviewer=opus→sonnet→инлайн). Done+закоммичено: 1.0–1.14, 1.17, 1.18
(1.14 — коммит 4536049 2026-07-16: CLI aec-rag scan + ScanScheduler + кнопка).
1.15 — коммит a991ef8 (тост + ScanReportEnvelope). 1.16 + 1.19 — ревью пройдено,
verify зелёный, коммитятся. Осталось: 1.20 — последняя задача фазы. Гейты сняты 15.07.

## In flight (эта сессия)
- 1.20 привязка чата/агента к открытому проекту — следующая диспетчеризация.
- После 1.20: NOTES closeout + закрытие Phase 1.

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
