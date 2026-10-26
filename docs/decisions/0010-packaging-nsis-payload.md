# 0010 — Упаковка: electron-builder NSIS + zip, PM-payload ядра, свой Python для MCP

- Date: 2026-10-16 (T21, интервью старта фазы 3); облегчение поставки — 2026-10-22 (T43.1)
- Status: accepted
- Approved by: owner

## Context

Нужен установщик Windows для инженера-непрограммиста, с выбором каталога (UR40) и режима
(UR25). Ядро не собирается в колесо (их `setup.py` отказывает); донор ставит Windows-версию
только как MSIX.

## Options

### electron-builder 26 NSIS + zip того же каталога; ядро — их PM-payload; наш Python 3.12 — standalone — chosen

- Advantages: выбор каталога и режима на странице установщика; ядро поставляется так же,
  как у донора (закреплённый коммит, CPython 3.14.7, переносимое дерево зависимостей,
  инструменты PM); разработка идёт на том же payload, что получает инженер.
- Limitations: сборка держится за внутренние имена их сборщика (каждый подъём пина
  перепроверяет `stage_core.py`); байты сборок не повторяются — воспроизводимость
  проверяется версиями, целостность установки — хешами; установка без подписи (A7).
- Cost and effort: сборка ~30 минут; установка ~9 минут после облегчения.
- Changing it later: costly.

### MSIX, как у донора

- Limitations: ставится в `WindowsApps` без выбора каталога (UR40 нарушен по построению) и
  без подписи не ставится вовсе.

### Цель `portable` electron-builder

- Limitations: при каждом запуске распаковывает ~3 ГБ в `%TEMP%` — пишет вне корня и
  стартует минутами.

## Decision

`corepack pnpm -C apps/desktop run dist:win`: electron-vite, затем electron-builder 26.17.0
(стабильная ветка, MIT) по `apps/desktop/electron-builder.config.cjs` — NSIS
(`oneClick: false`, выбор каталога, `perMachine: false`) и zip. В asar едет только то, что
главный процесс грузит во время работы (`exceljs`, `get-windows` и их замыкание). Payload
ядра собирает `runtime/payload/stage_core.py` (их `native.py::_prepare_native` по частям)
с нашим набором инструментов (`python`, `uv`, `node`, `npm`, `git`, `ripgrep`,
`agent-browser`, `chromium`), extras `mcp`, `ddgs`, зависимостями Mem0, без `pillow-heif`.
Python MCP — standalone CPython 3.12.13 со своим `site-packages` из нашего `uv.lock`
(`runtime/payload/stage-mcp.mjs`). Версии записаны в `runtime/payload/payload-versions.json`
(в git), хеши файлов — в `payload-hashes.json` внутри каждого payload.

## Consequences

- Обновление — тем же установщиком; `data` сохраняется (`customRemoveFiles`).
- Из поставки исключены стек моделей PDF Docling (torch и др.), pip, tcl/tk, тесты пакетов,
  кэш uv ядра: 61 тыс. файлов и 2,7 ГБ вместо 102 тыс. и 3,7 ГБ.
- Подробно — [plan-details.md](../plan-details.md) §«Упаковка и поставка»,
  [установка и поставка](../components/packaging.md).
