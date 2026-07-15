# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 1 — Vault & sources, ОРКЕСТРАЦИЯ ИДЁТ (старт 2026-07-14 по команде владельца;
executor=sonnet, reviewer=opus→sonnet→инлайн). Done+закоммичено: 1.1, 1.2, 1.5, 1.9,
1.10, 1.11, 1.13 (7 коммитов, все с ревью). 2026-07-15 владелец снял ВСЕ гейты:
«дизайн утверждаю» (1.0 разблокирована), go на Vibe Diff hermes[mcp]==0.18.0
(1.12 доделывается), ручные verify 0.13/0.17 подтверждены (0.14/0.15 — ранее).

## In flight (эта сессия)
- 1.0 shell — executor диспетчеризован (дизайн: design/tokens.css + макеты screens/).
- 1.12 — executor доустанавливает hermes[mcp], правит setup.mjs + PLAN, живой verify.
- 1.18 edge-фикстуры — фикс-итерация по ревью (long-path probe, UNC-пороги).
- Далее по dep: 1.17 (после 1.12) → UI-хвост 1.3/1.4/1.6/1.7/1.8 (после 1.0) →
  1.14/1.15/1.16 → 1.19.

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
