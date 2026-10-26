# 0003 — Electron + React + TypeScript; Python-слой на uv

- Date: 2026-07-06 (стек MVP); подтверждено 2026-08-05 вместе с переходом на стек донора
- Status: accepted
- Approved by: owner

## Context

Пользователь — инженер на Windows, терминалом не пользуется: нужен графический интерфейс с
первого дня (C6). Ядро и вся экосистема разбора документов (Docling, LightRAG, OCR) — на
Python. Интерфейс донора — Electron + React.

## Options

### Electron + React + TypeScript; Python для расширений — chosen

- Advantages: тот же стек, что у донора, — их код переносится копированием; кроссплатформенная
  сборка; Python-экосистема RAG доступна напрямую.
- Limitations: двойной рантайм Node + Python усложняет упаковку (R5); размер поставки.
- Cost and effort: два менеджера пакетов (pnpm через corepack, uv), два набора тестов.
- Changing it later: hard.

### Tauri или нативный интерфейс

- Advantages: меньше вес.
- Limitations: код донора не переносится; всё — своими руками.
- Changing it later: hard.

### Веб-приложение в браузере

- Advantages: без установки окна.
- Limitations: нужен сервер (против C4), нет доступа к локальным папкам и safeStorage.
- Changing it later: costly.

## Decision

Desktop — TypeScript, React, Electron, сборка electron-builder, пакетный менеджер pnpm 11
через corepack. Python-слой — Python 3.12 (наши MCP-серверы, корневой `.venv`) под uv с
lock-файлом; MCP — официальный Python SDK. Тесты: Vitest, pytest, Playwright; линтеры:
eslint + prettier, ruff.

## Consequences

- Пины инструментов — [plan-details.md](../plan-details.md) §«Stack & package managers»
  (Node 24 LTS, Electron 43, pnpm 11, uv 0.11).
- pnpm 11 блокирует postinstall — `onlyBuiltDependencies=[electron, esbuild]` в
  `pnpm-workspace.yaml`; карантин свежих пакетов дописывает `minimumReleaseAgeExclude`.
- У проекта два Python-окружения: корневой `.venv` (наши MCP, Python 3.12) и venv ядра
  (`runtime/.hermes-venv`, Python 3.14) — путать их при работе с зависимостями нельзя.
