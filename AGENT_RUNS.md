# AGENT_RUNS — audit trail of non-trivial runs
<!-- Record a run ONLY for non-trivial / risky / multi-file / dependency / security /
     AI-eval / external-tool work. One terse block per run. Never store secrets. -->

## 2026-07-06 — bootstrap planning set (research → grill → planning docs)
- Intent: превратить концепцию AECPilot в утверждаемый комплект планирования; ресерч OSS-кандидатов (перепроверен по первоисточникам), grill-интервью (2 раунда, 12+ решений), затем DESCRIPTION/SPECIFICATION/specs/PLAN/TASKS.
- Risk class: medium (локальные создания файлов документации) · approvals: grill-ответы владельца ✔; создание файлов — явная команда владельца ✔; утверждение комплекта — ОЖИДАЕТСЯ.
- Changed files: DESCRIPTION.md, SPECIFICATION.md, specs/workspace-sources.md, specs/qa-over-sources.md, PLAN.md, TASKS.md, AGENT_RUNS.md (новые).
- Validation: consistency-review комплекта (SPEC↔specs↔PLAN↔TASKS, non-goals intact) — pass; код не менялся, тесты не применимы.
- Skipped checks / waivers: none.
- Outcome: комплект готов, ожидает явного утверждения владельцем; имплементация не начата (planning gate). Residual: O1–O4 (открытые вопросы SPECIFICATION), R1–R7 (риски с митигициями по фазам).

## 2026-07-06 — specs всех фич + атомарная декомпозиция TASKS
- Intent: по замечанию владельца довести TASKS до атомарности; для этого написаны спеки оставшихся фич (wiki, id-check, docgen, agent-memory) на основе доп. grill-ответов, затем все 6 фаз декомпозированы (92 задачи с ID/dep/verify).
- Risk class: medium (файлы документации) · approvals: доменные решения владельца ✔ (id-check: чек-лист+противоречия; docgen: ПЗ, «другое» — уточнить (O5); память: авто+видимость); утверждение комплекта — ОЖИДАЕТСЯ.
- Changed files: specs/wiki.md, specs/id-check.md, specs/docgen.md, specs/agent-memory.md (новые); TASKS.md (переписан атомарно); SPECIFICATION.md, PLAN.md, specs/workspace-sources.md (синхронизация).
- Validation: consistency-review комплекта — pass; кода нет, тесты не применимы.
- Skipped checks / waivers: none.
- Outcome: комплект v2 на утверждении. Open: O5 (текст ответа «другое» по docgen не дошёл — уточнить у владельца).

## 2026-07-08 — дизайн-решения UI: planning-проход + бриф для Claude Design
- Intent: зафиксировать решения владельца по UI (IDE-shell, правый чат-док, Linear-светлый визуал, hub «Агент», источники-деревья + «показать в проводнике», aec-id-check — из MVP) и подготовить дизайн-бриф; основа паритета G4 — инвентарь поверхности tui_gateway 0.18.0 (~170 методов/событий, снят по запиннённому пакету в runtime/.hermes-venv, read-only).
- Risk class: medium (правки планировочных документов) · approvals: решения владельца в обсуждении ✔; комплект правок утверждён владельцем ✔ («утверждаю комить и продолжай оркестрацию»).
- Changed files: SPECIFICATION.md (G3/G4/N9/UR2/UR5/UR10/AC4), specs/workspace-sources.md (+2 сценария, UI-опы), specs/id-check.md (DEFERRED-баннер), PLAN.md (IA слоя 1, инвентарь gateway, фаза 4, дизайн-воркстрим, риск), TASKS.md (1.0 shell; 4.6–4.9 → Deferred; dep 5.5; 4.13), design/DESIGN_BRIEF.md (новый), NOTES.md.
- Validation: consistency-review (SPEC↔specs↔PLAN↔TASKS↔бриф) — pass; код не менялся.
- Skipped checks / waivers: none.
- Outcome: комплект v3 утверждён; владелец генерит дизайн в Claude Design по брифу; оркестрация продолжается (0.12/0.16), перекладка UI в shell — задача 1.0.

## 2026-07-28 — задача 1.6.1: dependency-vetting + Vibe Diff набора чата (батч 1 фазы 1.6)
- Intent: разблокировать вендоринг чат-ленты Hermes — проверить и поставить `@assistant-ui/react`, `@assistant-ui/react-streamdown`, `streamdown`, `@streamdown/code` и среду компонентных тестов (jsdom + testing-library).
- Risk class: **high** (изменение зависимостей) · approvals: Vibe Diff предъявлен с измерениями → явное «go» владельца ✔ вариант A (линия донора, точные пины; `@streamdown/code` сейчас, `shiki`/`react-shiki` — в 1.6.11; jsdom 29.1.1).
- Changed files: apps/desktop/package.json, pnpm-lock.yaml, pnpm-workspace.yaml (pnpm сам дописал `minimumReleaseAgeExclude`), PLAN.md (§Selected dependencies + §Phase 1.6 измерения/поправка 1/риск), TASKS.md (1.6.1 закрыта, уточнена 1.6.11), AGENT_RUNS.md.
- Dependencies: runtime `@assistant-ui/react@0.14.29`, `@assistant-ui/react-streamdown@0.3.7`, `streamdown@2.5.0`, `@streamdown/code@1.1.1`; dev `jsdom@29.1.1`, `@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`. Все точными пинами (`pnpm add -E`).
- Validation: реестр+провенанс (репозитории соответствуют владельцам), транзитивный скан лицензий (331 пакет дерева чата + 58 тест-среды — все permissive, C3 ✔), `npm audit` 0 уязвимостей, установочных скриптов нет, вес на диске и в бандле измерен на изолированных пробах; после установки — vitest 453/453, eslint+tsc+prettier чисто, build чист.
- Skipped checks / waivers: полный `security-review` не запускался — веттинг покрыл его предмет для этого изменения (секретов и внешнего I/O не добавлено, аудит и лицензии проверены); кода на новых пакетах ещё нет.
- Outcome: гейт закрыт, задачи 1.6.3–1.6.7 разблокированы. Residual: (1) `mermaid` 80 МБ в node_modules как неимпортируемая зависимость `streamdown` (в бандле нет); (2) 7 пакетов семейства assistant-ui опубликованы в день установки → записаны в pnpm-карантин `minimumReleaseAgeExclude`; (3) `assistant-cloud` в дереве — в бандле вытряхнут, контроль грепом повторить в 1.6.4; (4) высокий churn assistant-ui — апгрейд только парой.

## 2026-07-31 — обновление ядра 0.18.0 → 0.19.0 (задачи 1.6.U1/U2)
- Intent: перевести ядро на 0.19.0 по решению владельца, принятому после предъявленного разбора изменений; адаптировать наш код к тому, что в нём поменялось.
- Risk class: **high** (изменение зависимости) · approvals: разбор изменений предъявлен с измерениями → явное «переделай под 0.19.0» владельца ✔.
- Changed files: runtime/hermes-env.mjs (пин), apps/desktop/src/main/index.ts (`include_unconfigured`), shared/gateway/types.ts (три статуса `prompt.submit`, события истечения, параметр каталога), renderer/src/chat/chat-state.ts (+`secret.expire`/`sudo.expire`, три новых события в игнорируемые), chat-state.test.ts, PLAN.md (§Обновление ядра), specs/agent-skills.md, TASKS.md, AGENT_RUNS.md.
- Dependencies: `hermes-agent[mcp]` 0.18.0 → **0.19.0** (PyPI, MIT). Веттинг ДО установки по фактам: пакет тот же, лицензия та же, **диф `Requires-Dist` по базовым зависимостям и по extra `mcp` ПУСТ** — новых пакетов в дереве не появилось (менялись только extras slack/feishu/honcho/nemo-relay, которые мы не ставим). Профиль `runtime/dev-profile` забэкаплен до установки.
- Validation: `serve.mjs smoke` чист; `aec-sources-check` exit 0 (живой ход модели через MCP-инструмент); `checkpoint-probe` — поведение маркера подтверждено; `skills-probe` перепрогнана; `hermes-event-diff` перепрогнан; vitest 882 зелёных; tsc+eslint+prettier чисто; e2e 4/4; осиротевших процессов нет.
- Skipped checks / waivers: полный `security-review` не запускался — изменение не добавляет ни секретов, ни внешнего I/O; предмет закрыт веттингом (лицензии, дерево зависимостей, отсутствие установочных скриптов).
- Outcome: ядро на 0.19.0. **Единственное, что сломалось бы молча, — `model.options`:** до 0.18.0 их обработчик сам форсировал `include_unconfigured`, в 0.19.0 это параметр с дефолтом `false`; измерено на живом ядре — 3 провайдера против 41. Исправлено одной строкой. Residual: (1) 0.19.1 существует тегом репозитория, но не в реестре — решением владельца пропускаем, ждём 0.20.0 (задача 1.6.U5); (2) `tool.output_risk` игнорируется до разбора payload (§Discovered); (3) слепок поверхности зависимости снят в `runtime/contracts/hermes-0.19.0.json`, сравниватель будет написан при выходе 0.20.0.
