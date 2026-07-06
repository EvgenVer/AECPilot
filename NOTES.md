# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 0 — Foundations (TASKS 0.1–0.16), режим оркестрации (executor=sonnet, reviewer=opus).
Выполнено: 0.1–0.6 (каркасы, линтеры, изолированный hermes-runtime). Все корневые скрипты corepack-явные — pnpm в PATH не нужен.
Следующее: 0.7 (запуск serve из Node + health-check) → 0.8 (gateway-smoke; потребует OpenAI-ключ владельца в runtime/dev-profile, плейсхолдер-подход) → 0.9 (SOUL в gateway, риск R2).
Инцидент-урок: corepack enable в каталог hermes (вне workspace) — откачен полностью (12 шимов, node.exe цел); брифы executor'ам теперь явно запрещают модификации вне репо.
Решение владельца: dev-LLM = OpenAI напрямую; ключ владелец впишет сам в gitignored-файл на задаче 0.8 (плейсхолдер-подход).

## Decisions taken
- Тулкит-файлы закоммичены отдельным chore-коммитом (по вопросу владельца).
- Electron пиннем на свежий мажор 43.x (вышел 2026-06-30): самый длинный runway поддержки (янв 2027), Node 24 совпадает с системным LTS.
- hermes-agent требует Python >=3.11,<3.14 → на 3.14 не переходить, пин 3.12.13.

## Open threads / next steps
- [ ] 0.3 pnpm-workspace + Electron hello window (Vite, electron-builder заготовка)
- [ ] 0.4 uv-workspace + каркас mcp/aec_sources (1 проходящий pytest)
- [ ] 0.6 runtime-лончер (изолированный HERMES_HOME) → 0.7 serve → 0.8 gateway-smoke
- [ ] 0.9 проверка R2 (SOUL.md в gateway-режиме) — до постройки чата (0.11+)
