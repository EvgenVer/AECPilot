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
