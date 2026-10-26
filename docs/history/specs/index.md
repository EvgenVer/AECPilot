# Контракты функций

Прежние `specs/` — поведенческие контракты функций (сценарии, API, схемы данных, пограничные
случаи), уточнявшие спецификацию. Перенесены 2026-10-26 без изменений. Требования —
[PRODUCT.md](../../PRODUCT.md) (при расхождении верен он); как устроено сейчас —
[компоненты](../../components/main-process.md) и [сценарии](../../flows/question-with-citation.md).
Комментарии в коде ссылаются на эти файлы как `specs/<файл>.md`.

| Контракт | Требования | Состояние |
|---|---|---|
| [workspace-sources](workspace-sources.md) | UR1–UR2, UR7–UR8 — проект, источники, сканирование | действует |
| [qa-over-sources](qa-over-sources.md) | G1, UR3, UR24, UR26 — ответ по источникам, формат цитаты | действует |
| [wiki](wiki.md) | G2, UR6 — вики проекта | действует; переделка после выпуска (D-197) |
| [agent-chat](agent-chat.md) | UR4 — лента чата | действует |
| [agent-sessions](agent-sessions.md) | UR4, UR46 — сессии, профили, палитра | действует |
| [agent-skills](agent-skills.md) | UR5, UR23 — навыки, обучение, куратор | действует |
| [agent-memory](agent-memory.md) | память двух слоёв, UR43 | действует |
| [agent-roster](agent-roster.md) | UR27 — специалисты | провенанс: реализация — перенос их плагина ([0007](../../decisions/0007-roster-donor-plugin.md)) |
| [checkpoints-rollback](checkpoints-rollback.md) | UR14, UR16 — снимки и откат | действует |
| [workbench-panels](workbench-panels.md) | UR17 — лента команд, процессы, уведомления | действует; панель «Терминал» снята (HX7-прим.) |
| [external-surfaces](external-surfaces.md) | UR22 — артефакты и карта обучения | действует |
| [docgen](docgen.md) | N17 | заморожен до возврата после MVP |
| [id-check](id-check.md) | N9 | заморожен до возврата после MVP |
