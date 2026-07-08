# NOTES — working notes for the current task
<!-- High churn. Progress, resume points, open threads. Clean out when the task closes
     (run the planning skill's NOTES closeout first). Stable facts → MEMORY.md. -->

## Current task & state
Phase 0 — Foundations (TASKS 0.1–0.16), режим оркестрации (executor=sonnet, reviewer=opus).
Выполнено: 0.1–0.10 (коммиты по блокам; последние — 01812a1 task 0.9, d21ce4e task 0.10). Ключевые факты gateway (разведка 0.7): ws://127.0.0.1:18789/api/ws, newline-delimited JSON-RPC, привет gateway.ready; auth ?token= + env HERMES_DASHBOARD_SESSION_TOKEN; serve стартует без LLM-ключа (ключ нужен только при реальном вызове модели); `hermes serve --stop/--status` не видят чужие процессы — гасим по pid+taskkill; Rollup инлайнит relative .mjs — обходится dynamic import с @vite-ignore (TODO Phase 5: app.asar).
0.8 закрыт полностью: ключ владелец вписал в runtime/dev-profile/.env (вне git), полный цикл с ответом модели «PONG» exit 0. Карта протокола tui_gateway — в Done-записи 0.8 в TASKS (session.create / prompt.submit / message.start|delta|complete / status.update / session.close; ошибка провайдера = message.complete status="error", НЕ json-rpc error). Конфиг: provider «openai-api» (не «openai» — алиас openrouter), model bare-slug gpt-5-mini.
0.9: R2 НЕ воспроизводится — SOUL.md применяется в gateway 0.18.0 (маркер AEC-SOUL-ACTIVE в ответе, soul-check exit 0), workaround не нужен; общие WS-хелперы в runtime/gateway-client.mjs. 0.10: типизированный GatewayClient в apps/desktop/src/shared/gateway/** (не src/gateway — общий main/renderer), vitest 20/20, включает reconnect (exp backoff) и request(id-match+timeout).
0.11 DONE (ручной verify владельца пройден: «Connected» + стриминговый чат): main-proxied GatewayClient + IPC-мост, reducer + ChatPanel; коммиты 3357a2b + два forensic-фикса (c8b216e гидрация состояния, a1d7842 waitHealthy перед connect) + формат-фикс ad6f7bd. Два бага ловились ТОЛЬКО ручным прогоном (авто-проверки были зелёные): (1) состояние 'ready' выставлялось push'ем до создания окна → нужен pull `gateway:get-state` + гидрация на mount; (2) connect до готовности gateway (без waitHealthy), а GatewayClient не ретраит первый connect. Оба изолированы пробником в Electron main (scratchpad/connect-probe.cjs: immediate FAIL / after-waitHealthy OK / полный цикл→«PONG»). Урок: main-side gateway-путь надо проверять в Electron main (не только node smoke); connect ВСЕГДА после waitHealthy.
Комплект v3 УТВЕРЖДЁН и закоммичен (8fd618d, 08.07): IDE-shell, чат=правый док, Linear-светлый, hub «Агент» (UR10), источники-деревья+проводник (UR2), aec-id-check → post-MVP (N9); design/DESIGN_BRIEF.md готов — владелец генерит макеты в Claude Design; перекладка UI = задача 1.0.
Выполнено сегментом 08.07 (все по циклу executor→reviewer→fix→коммит): 0.12 tool-карточки (b2c8605; контракт tool.start/complete снят живой разведкой), 0.16 Playwright e2e с python-mock-gateway (5d868b3; AEC_GATEWAY_URL-override в main), 0.13 approvals (ae9e8fc; контракт ДОСЛОВНО из исходников: FIFO без request_id, choice once/session/always/deny, allow_permanent гейтит «Всегда»), 0.14 сессии (селектор, session.resume→новый sid, история в items; epoch-guard от clobber). vitest 50/50, e2e 1 passed, root lint зелёный.
ОЖИДАЮТ РУЧНОГО verify владельца (один прогон `pnpm dev` покроет всё): (а) 0.13 живой approve-цикл — попросить агента выполнить shell-команду → карточка → Разрешить; заодно визуально 0.12 tool-карточки; (б) 0.14 — две сессии + рестарт приложения, история открывается.
Следующее: 0.15 (настройки LLM) — SECURITY-gate: сначала решение владельца по хранению ключа (safeStorage vs dev-.env, судьба текущего .env, канал применения endpoint/model — есть gateway RPC model.*/config.set, нужен recon как model.save_key персистит). Phase 0 после 0.15 закрыт → Phase 1 (гейт задачи 1.0 — утверждённый дизайн из Claude Design).
Лимиты: executor'ы 0.12/0.16 (sonnet) падали на лимите в первой попытке (resets 11:30) — оба доделаны свежими executor'ами после сброса; ревью 0.12–0.14 шли на opus без сбоев.
Лимиты моделей (на момент 0.10): opus И fable оба упёрлись в лимит сессии (opus resets ~9:30am, fable «reached Fable 5 limit»); ревью Блока F проведено на sonnet (свежий контекст, executor-бюджет был), fix-дельта пере-ревьюена координатором инлайн (§10). Порядок эскалации ревьюера: opus → fable → sonnet → инлайн-координатор.
Инцидент-урок: corepack enable в каталог hermes (вне workspace) — откачен полностью (12 шимов, node.exe цел); брифы executor'ам теперь явно запрещают модификации вне репо.
Решение владельца: dev-LLM = OpenAI напрямую; ключ владелец впишет сам в gitignored-файл на задаче 0.8 (плейсхолдер-подход).

## Decisions taken
- Тулкит-файлы закоммичены отдельным chore-коммитом (по вопросу владельца).
- Electron пиннем на свежий мажор 43.x (вышел 2026-06-30): самый длинный runway поддержки (янв 2027), Node 24 совпадает с системным LTS.
- hermes-agent требует Python >=3.11,<3.14 → на 3.14 не переходить, пин 3.12.13.

## Open threads / next steps
- [x] 0.11 чат-панель — DONE (ручной verify владельца пройден; +2 forensic-фикса: гидрация c8b216e, waitHealthy a1d7842). Гейт снят: 0.12/0.13/0.14/0.16 разблокированы
- [ ] 0.12/0.13/0.14 (tool-вывод, approvals, сессии) — dep 0.11, parallel между собой
- [ ] 0.15 настройки LLM (endpoint/key в safeStorage → hermes-профиль) — dep 0.7, независим от 0.11; security-sensitive (ключ, auth)
- [ ] 0.16 Playwright e2e-smoke — dep 0.11
- Незакрытый nit (0.9): в runtime/gateway-client.mjs id-префикс RPC захардкожен «smoke-» — косметика, править при следующем касании файла
