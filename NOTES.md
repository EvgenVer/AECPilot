# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 0 — Foundations (TASKS 0.1–0.16), режим оркестрации (executor=sonnet, reviewer=opus).
Выполнено: 0.1–0.7. Ключевые факты gateway (разведка 0.7): ws://127.0.0.1:18789/api/ws, newline-delimited JSON-RPC, привет gateway.ready; auth ?token= + env HERMES_DASHBOARD_SESSION_TOKEN; serve стартует без LLM-ключа (ключ нужен только при реальном вызове модели); `hermes serve --stop/--status` не видят чужие процессы — гасим по pid+taskkill; Rollup инлайнит relative .mjs — обходится dynamic import с @vite-ignore (TODO Phase 5: app.asar).
0.8 закрыт полностью: ключ владелец вписал в runtime/dev-profile/.env (вне git), полный цикл с ответом модели «PONG» exit 0. Карта протокола tui_gateway — в Done-записи 0.8 в TASKS (session.create / prompt.submit / message.start|delta|complete / status.update / session.close; ошибка провайдера = message.complete status="error", НЕ json-rpc error). Конфиг: provider «openai-api» (не «openai» — алиас openrouter), model bare-slug gpt-5-mini.
Следующее: параллельно 0.9 (SOUL в gateway, риск R2; после проверки вернуть нейтральный SOUL и перепрогнать gateway-smoke) и 0.10 (WS-клиент UI + vitest).
Лимиты моделей: ревью 0.7 упало на лимите opus — перезапущено на fable (одобренный fallback: «orchestrator=fable»-сессия); следующие ревью — снова opus, если лимит сброшен (16:00 Сантьяго).
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
