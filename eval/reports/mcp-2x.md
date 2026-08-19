# MCP 2.x: что ломается у нас и в каком порядке это чинить

Задача 3.B0а. Замер 2026-08-19.

Направление задано решением владельца 2026-08-18: **MCP 2.x — стандарт, идём за
ним**. Поэтому здесь не решается «мигрировать ли»; здесь замеряется цена и, что
важнее, **порядок**: обязаны ли подъём пина ядра (3.B0) и переезд наших серверов
(3.B0б) лечь одним изменением, или могут ехать по отдельности.

## Как мерили

Отдельный venv в scratchpad, вне репозитория и вне рабочего venv:

```
.venv\Scripts\python.exe -m venv <scratch>\mcp2      # python 3.12.13
<scratch>\mcp2\Scripts\python.exe -m pip install mcp==2.0.0
```

`mcp==2.0.0` — последняя опубликованная версия (`pip index versions mcp`).
Наши серверы при этом запускались **как есть**, из рабочего venv, на `mcp 1.28.1`.
Ничего в репозитории не менялось.

Первое, что подтвердилось буквально:

```
>>> import mcp.server.fastmcp
ModuleNotFoundError: No module named 'mcp.server.fastmcp'
```

`mcp.server` теперь отдаёт `MCPServer` (и низкоуровневый `Server`).

## Вопрос 1 — где `ToolError`

```python
from mcp.server.mcpserver.exceptions import ToolError   # 2.0
# было: from mcp.server.fastmcp.exceptions import ToolError
```

Определён в `mcp/server/mcpserver/exceptions.py:21`, `class ToolError(MCPServerError)`.
Поведение то же: при вызове `call_tool` внутри процесса он **поднимается**, а не
возвращается результатом. Это проверено на обеих версиях и совпадает:

| | тело инструмента бросило `ToolError` | вызов несуществующего инструмента |
|---|---|---|
| `mcp 1.28.1` | `raise ToolError('Error executing tool boom: bang')` | `raise ToolError('Unknown tool: nope')` |
| `mcp 2.0.0`  | `raise ToolError('Error executing tool boom: bang')` | `raise ToolError('Unknown tool: nope')` |

По проводу и там и там приходит `isError: true` — это видно в проверке вопроса 4.

Правка: одна строка импорта на файл, три файла (`aec_sources/server.py`,
`aec_sources/fs.py`, `aec_rag/server.py`). Сами 25 мест `raise ToolError(...)`
не трогаются.

## Вопрос 2 — принимает ли `@server.tool()` параметр `description=`

Да, имя и место параметра не изменились:

```python
MCPServer.tool(self, name=None, title=None, description=None,
               annotations=None, icons=None, meta=None, structured_output=None)
```

Все **19** наших инструментов (4 в `aec-sources`, 15 в `aec-rag`) объявлены
через `@server.tool(description=...)` и не требуют ни одной правки. Схема входа
по-прежнему выводится из аннотаций типов — проверено на прототипе, `range: list[int] | None`
дал тот же `anyOf`, что и раньше.

> В тексте задачи 3.B0а стояло «все 10 инструментов». Инструментов **19**;
> цифру в TASKS.md поправили по этому замеру.

## Вопрос 3 — чем заменён приватный `_tool_manager`

**Ничем: он остался, под тем же именем и с тем же контрактом.**

```python
s = MCPServer(name="probe")
s._tool_manager                      # mcp.server.mcpserver.tools.tool_manager.ToolManager
s._tool_manager.get_tool(name)       # -> Tool | None      (как и в 1.x)
```

То есть предсказание комментария в `aec_sources/server.py` («if a dependency bump
renames/removes it, this silently stops journaling») в этот раз **не сбылось** —
но проверять всё равно надо было именно так, вызовом, а не чтением changelog.

Что действительно изменилось — **сигнатура и тип возврата самого `call_tool`**,
то есть ровно тот метод, который мы переопределяем:

```python
# 1.x
async def call_tool(self, name, arguments) -> Sequence[ContentBlock] | dict[str, Any]
# 2.0
async def call_tool(self, name, arguments, context: Context | None = None) -> CallToolResult | InputRequiredResult
```

Отказ здесь **громкий**, а не тихий: не добавив третий параметр, мы получим
`TypeError` на первом же вызове. Тело метода в 2.0 осталось таким же тонким
(`return await self._tool_manager.call_tool(...)`), так что точка врезки цела.

Прототип миграции `_AuditingFastMCP` собран и прогнан целиком:

```python
class _AuditingMCPServer(MCPServer):
    logs_dir: Path | None = None

    async def call_tool(
        self, name: str, arguments: dict[str, Any], context: Context | None = None
    ) -> CallToolResult | InputRequiredResult:
        if self.logs_dir is not None and self._tool_manager.get_tool(name) is None:
            log_rejected(self.logs_dir, {"event": "unknown_tool", "tool": name})
        return await super().call_tool(name, arguments, context)
```

Результат прогона: инструменты регистрируются с описаниями, `ToolError` из тела
поднимается, вызов `sources_write` записывает в журнал
`{'event': 'unknown_tool', 'tool': 'sources_write'}`. Произвольные атрибуты на
сервере (`logs_dir`, `source_roots`, `rag_state`) присваиваются без возражений.
`server.run("stdio")` и `server.run()` работают как прежде — умолчание транспорта
осталось `'stdio'`.

## Вопрос 4 — заговорит ли клиент 2.x с нашими серверами БЕЗ изменений

**Да.** Клиент на `mcp 2.0.0` поднял оба наших сервера, работающих на `mcp 1.28.1`,
через stdio и получил ответ от каждого инструмента.

Версии протокола расходятся, и согласование их сводит:

| сторона | своя последняя версия | согласовано |
|---|---|---|
| клиент `mcp 2.0.0` | `2026-07-28` | **`2025-11-25`** |
| наш сервер `mcp 1.28.1` | `2025-11-25` | |

`aec-sources` — 4 инструмента из 4 в списке, у всех описание на месте, все 4
вызваны и ответили содержательно (`sources_list`, `sources_tree`, `sources_read`,
`sources_stat`). Вызов несуществующего `sources_write` вернул
`isError: Unknown tool: sources_write`, и — главное — журнал написался:

```
.aecpilot/logs/sources-rejected.jsonl
{"ts": "2026-08-19T04:16:50.088360+00:00", "event": "unknown_tool", "tool": "sources_write"}
```

`aec-rag` — 15 инструментов из 15 в списке, ни одного без описания, все 15
вызваны. Одиннадцать ответили нормально, три вернули честную ошибку инструмента
(`rag_job` на несуществующей задаче; `rag_query` и `rag_overview` — «переменная
окружения OPENAI_API_KEY не задана»), а `rag_ingest` упёрся в мой клиентский
предел ожидания в 12 секунд, потому что LightRAG уходит в повторы на том же
отсутствующем ключе. Это свойство стенда, а не протокола: `rag_query` и
`rag_overview` проходят ровно тот же путь открытия индекса и возвращаются
аккуратной ошибкой.

### Вывод по порядку работ

**3.B0 (подъём пина) и 3.B0б (переезд серверов) едут по отдельности.**
Поднятое ядро 0.20.4 со своим `mcp 2.x` заговорит с нашими серверами на `mcp 1.x`
без единой правки, поэтому подъём пина не тянет за собой переезд и не обязан
ждать его. Зависимость 3.B0 остаётся прежней (`3.0, 3.B0а`) и дополнять её
задачей 3.B0б не нужно.

## Чего стоит 3.B0б

Не то, чего боялись. Продуктовый код почти не меняется, а весь объём — в тестах.

| место | правка | объём |
|---|---|---|
| импорт `ToolError` | `mcp.server.fastmcp.exceptions` → `mcp.server.mcpserver.exceptions` | 3 файла |
| импорт и базовый класс | `FastMCP` → `MCPServer` (из `mcp.server`) | 2 файла |
| `_AuditingFastMCP.call_tool` | третий параметр `context`, новый тип возврата | 1 метод |
| аннотации возврата | `Sequence[ContentBlock] \| dict` → `CallToolResult \| InputRequiredResult` | 1 файл |
| `@server.tool(description=...)` | — | 0 из 19 |
| `raise ToolError(...)` | — | 0 из 25 |
| **поля моделей в тестах** | `result.isError` → `result.is_error` и т.п. | **67 обращений в 7 файлах** |
| `pyproject` обоих пакетов | `mcp>=1,<2` → `mcp>=2,<3` | 2 файла |
| `test_dependency_floor.py` | `major == 1` → `major == 2` | 1 утверждение |

Про тесты подробнее: в 2.0 camelCase остался **только псевдонимом на проводе**,
а обращение из питона стало snake_case. Проверено:

```python
r = CallToolResult(content=[...], isError=True)   # конструктор по псевдониму — работает
r.is_error                                        # True
r.isError                                         # AttributeError
r.model_dump(by_alias=True)   # ['_meta','content','isError','resultType','structuredContent']
r.model_dump()                # ['content','is_error','meta','result_type','structured_content']
```

Затрагиваются `isError`, `inputSchema`, `structuredContent` — правка механическая,
но её 67 штук, и мимо неё не проехать: тест не «покраснеет по смыслу», он
свалится в `AttributeError`.

Отдельно про `test_dependency_floor.py::test_mcp_major_matches_the_core`. Поменять
там `1` на `2` мало — **его обоснование этим замером опровергнуто**. В комментарии
написано: «A major bump in the protocol library is the one skew that can actually
break the stdio handshake with the core's client». Вопрос 4 показал обратное:
мажорный разрыв 1.28.1 ↔ 2.0.0 рукопожатие не ломает, версии согласуются. Тест
осмысленно оставить — но как «не отставать от ядра осознанно», а не как «иначе
сломается связь». Формулировку править вместе с числом.

---

# Что переезд стоил на самом деле (задача 3.B0б, 2026-08-19)

Разведка выше замерила цену верно в той части, куда смотрела, и **пропустила две
вещи**, потому что смотрела на surface регистрации инструментов, а не на то, как
2.0 их исполняет и чем их тестируют. Обе всплыли при первом же прогоне.

## Пропуск 1 — сама тестовая обвязка исчезла

`mcp.shared.memory.create_connected_server_and_client_session` в 2.0 **удалён**;
из модуля остался только сырой `create_client_server_memory_streams`. На нём
держались шесть наших тестовых файлов и 56 вызовов — то есть все тесты, которые
разговаривают с сервером как клиент.

Собрана замена: `tests/mcp_harness.py` в каждом пакете, тот же контекстный
менеджер поверх переживших примитивов. Заодно снята вторая зависимость от
приватного имени: обвязка сама достаёт низкоуровневый сервер, поэтому тесты
больше не пишут `server._mcp_server` (в 2.0 он `_lowlevel_server`) — иначе это
переименование пришлось бы разносить по всем шести файлам.

## Пропуск 2 — 2.0 исполняет синхронное тело инструмента в ДРУГОМ потоке

Замерено прямо:

```
sync_tool  -> thread=20304 main=25668 same=False
async_tool -> thread=25668 main=25668 same=True
```

В 1.x на поток никто не смотрел, потому что всё шло на цикле событий. В 2.0
синхронное тело уезжает в рабочий поток пула, асинхронное остаётся на цикле.

Для `aec-rag` это сломало пять тестов сообщением
`SQLite objects created in a thread can only be used in that same thread`. И тут
обнаружилось, что **комментарий в `server.py` описывал флаг, которого никогда не
было**: он утверждал `check_same_thread=False`, а `db.open_index` звал
`sqlite3.connect(path)` без него. На 1.x это не стреляло — стрелять было нечем.

Починка — поставить флаг там, где соединение открывается, то есть сделать код
таким, каким комментарий его описывал. Безопасно это по конкретной причине,
проверенной поимённо: **все, кто пишет в `index.db`, — асинхронные тела**
(`rag_ingest`, `rag_graph_add` и `ingest`/`add_documents_to_graph` под ними), то
есть записи остаются на однопоточном цикле; синхронные тела только читают.
Прежнее обоснование («сериализовано однопоточным циклом») для синхронных тел
теперь **неверно**, и в комментарии оно заменено на это.

## Итог по объёму

| место | предсказано | оказалось |
|---|---|---|
| импорт `ToolError` | 3 файла | **2** (третье упоминание — в докстринге `fs.py`, не импорт) |
| `FastMCP` → `MCPServer` | 2 файла | 2 |
| `call_tool` | 1 метод | 1 |
| `@server.tool(description=…)` | 0 из 19 | 0 из 19 ✔ |
| `raise ToolError(...)` | 0 из 25 | 0 из 25 ✔ |
| camelCase в тестах | 67 в 7 файлах | **67 в 7 файлах** ✔ |
| `pyproject` | 2 файла | 2, и у `aec-rag` `mcp` вообще не был объявлен — жил на чужом дереве зависимостей; объявлен явно |
| `test_dependency_floor` | 1 утверждение | 1 + переписанное обоснование |
| **тестовая обвязка** | — | **1 новый модуль ×2 пакета, 6 файлов, 56 вызовов** |
| **потоки и SQLite** | — | **флаг в `db.py` + два исправленных комментария, 5 тестов** |

Вывод для следующей такой разведки: замер surface («принимает ли декоратор
параметр», «где лежит класс») отвечает на вопрос «скомпилируется ли», а не «будет
ли работать». Вопросы про исполнение — на каком потоке, в каком порядке, кто чем
владеет — надо задавать отдельно, и дешевле всего прогоном, а не чтением.

## Чем проверено

- `pytest mcp/` — **300 passed, 3 skipped**; ruff check и format чисто.
- Все **19** инструментов подняты клиентом 2.0 через stdio: 4 у `aec-sources`,
  15 у `aec-rag`, у всех описания на месте, все вызваны и ответили.
- **Журнал отвергнутых попыток пишется** — вызов несуществующего `sources_write`
  дал строку в `.aecpilot/logs/sources-rejected.jsonl`, проверено файлом, а не
  зелёным тестом. Это доказательство N3 (источники read-only по построению).
- Живое ядро 0.20.4 вызвало наш сервер: `mcp__aec_sources__sources_list` вернул
  источник (`runtime/aec-sources-check.mjs`).
- Ядро видит **оба** сервера: кэш схем в конце прогона
  `runtime/mcp-project-switch-probe.mjs` содержит и `aec-sources`, и `aec-rag`.
