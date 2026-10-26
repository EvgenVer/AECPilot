# Журнал решений

Одна страница — одно утверждённое владельцем решение с реальными альтернативами. Сводная
таблица — [ARCHITECTURE.md](../ARCHITECTURE.md) §Decision log; полное обоснование и замеры —
[plan-details.md](../plan-details.md).

| # | Решение |
|---|---|
| [0001](0001-core-without-fork.md) | Ядро hermes-agent без форка, через шлюз, пин по SHA из git |
| [0002](0002-donor-ui-in-our-shell.md) | Код Hermes Desktop внутри нашей оболочки |
| [0003](0003-desktop-stack.md) | Electron + React + TypeScript; Python-слой на uv |
| [0004](0004-files-first-storage.md) | Хранилище files-first: vault, SQLite FTS5, NanoVectorDB LightRAG |
| [0005](0005-two-tier-indexing.md) | Индексация в два уровня; текстовый слой раньше распознавания |
| [0006](0006-memory-mem0.md) | Память: записка ядра + Mem0 локально |
| [0007](0007-roster-donor-plugin.md) | Роестр специалистов: перенос их плагина, наш `aec-roster` поверх |
| [0008](0008-server-client-profiles.md) | Режимы «сервер / клиент» и SSH-туннель |
| [0009](0009-single-install-directory.md) | Всё в одном каталоге установки |
| [0010](0010-packaging-nsis-payload.md) | Упаковка: NSIS + zip, PM-payload ядра, свой Python для MCP |
| [0011](0011-schedule-tick-in-main.md) | Тик расписаний — в главном процессе |
| [0012](0012-core-0-22-2.md) | Подъём ядра на 0.22.2 |
| [0013](0013-user-chosen-provider.md) | Провайдера моделей выбирает пользователь |
| [0014](0014-credentials-storage.md) | Хранение учётных данных по типу |
| [0015](0015-licensing.md) | Лицензия продукта и правила лицензий зависимостей |
