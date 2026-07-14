# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
МЕЖФАЗНАЯ ПАУЗА (закрыта 2026-07-14 по команде владельца: «к фазе 1 не переходи»).
Phase 0 (0.1–0.17) реализована целиком, всё закоммичено, дерево чистое; уроки фазы
перенесены в MEMORY.md (closeout выполнен). Дизайн: v1 (14 экранов) + v2
(tokens.css/tokens.json, Viewers.html, правки Wiki/Settings/Agent/Shell) проверены
координатором (распаковкой бандлов) и закоммичены (c48833a, b89a90e).

## Ожидают владельца (гейты следующего шага)
- [ ] РУЧНОЙ verify 0.13+0.17: `pnpm dev` → селектор «Одобрения» в шапке чата →
      manual: `Выполни в shell команду: echo test` → approval-карточка → Разрешить;
      smart: та же команда без карточки (авто-решение); off: warning-окраска селектора,
      команда без вопросов. Переключения живые, без рестарта. (0.14/0.15 уже подтверждены.)
- [ ] Слово «дизайн утверждаю» → снимает гейт задачи 1.0 (перекладка UI в IDE-shell
      по design/tokens.css и макетам design/screens/).

## Resume point (следующая сессия)
Phase 1 — Vault & sources (specs/workspace-sources.md), режим оркестрации
(.agents/skills/orchestration; executor=sonnet, reviewer=opus→sonnet→инлайн):
- 1.0 shell-каркас — ТОЛЬКО после «дизайн утверждаю»; рабочий артефакт design/tokens.css.
- Независимые от дизайна, можно параллельно: 1.1 (схема project.json) и
  1.9–1.11 (MCP aec-sources, python; каркас → list/tree/stat → read+анти-traversal).
- Правило владельца: после каждого логического блока — отметка в TASKS + коммит.

## Open threads (мелочь, не гейты)
- nit (0.9): в runtime/gateway-client.mjs id-префикс RPC захардкожен «smoke-» —
  править при следующем касании файла.
- Discovered в TASKS: format:check не входит в корневой lint (предложение владельцу);
  ChatMessage без стабильного id (key={index}) — закрыть при первом stateful-пузыре
  или в 1.0.
- В макетах пара англ. меток («Staleness») — локализовать при вёрстке 1.0.
