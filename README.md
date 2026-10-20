# AECPilot

Рабочее место инженера-проектировщика с агентом: проект объединяет рабочую папку,
подключённые папки исходных данных и агента, который отвечает на вопросы со ссылками на
документы, ведёт вики проекта и следит за новыми редакциями заданий.

An engineering workspace with an agent for building design: a project brings together a
working folder, connected source-data folders and an agent that answers questions with
citations, keeps the project wiki and notices new revisions.

## Пользователям / For users

- Быстрый старт: [docs/quickstart.ru.md](docs/quickstart.ru.md)
- Quickstart: [docs/quickstart.en.md](docs/quickstart.en.md)

Windows 10/11 x64. Установщик ставит всё в одну выбранную папку; установка начисто идёт
около 15 минут. / Everything is installed into one folder you pick; a fresh install takes
about 15 minutes.

## Разработчикам / For developers

Нужны Node.js с corepack (pnpm), `uv` и `git`.

```bash
corepack pnpm install
```

```bash
node runtime/setup.mjs
```

`setup.mjs` ставит ядро на пине и собирает обе среды поставки (`runtime/core`,
`runtime/mcp`) — подробности в [runtime/README.md](runtime/README.md).

| Команда | Что делает |
|---|---|
| `corepack pnpm dev` | приложение в режиме разработки (профиль `runtime/dev-profile`) |
| `corepack pnpm build` и `corepack pnpm app` | сборка и запуск из рабочей копии |
| `corepack pnpm test` | модульные тесты (vitest и pytest) |
| `corepack pnpm lint` | линтеры, типы, формат, аудит зависимостей |
| `corepack pnpm -C apps/desktop run dist:win` | установщик и zip в `apps/desktop/release` (~30–60 минут) |

Документы проекта: [DESCRIPTION.md](DESCRIPTION.md), [SPECIFICATION.md](SPECIFICATION.md),
[PLAN.md](PLAN.md), [TASKS.md](TASKS.md); правила работы агентов — [AGENTS.md](AGENTS.md).
