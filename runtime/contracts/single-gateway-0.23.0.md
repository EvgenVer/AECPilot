# Окно на едином шлюзе ядра 0.23.0 — замер (задача T53.1)

2026-11-11. Ядро `v0.23.0` (`2bd378ed`), поставка `runtime/core`. Решение
[0017](../../docs/decisions/0017-single-gateway.md). Проба — `runtime/single-gateway-probe.mjs`,
таблицы ядра — `runtime/single-gateway-classify.py`. Четыре прогона на временной копии
`runtime/e2e-profile` (`%TEMP%\aecpilot-acceptance-profile-t531-*`, через `AEC_HERMES_HOME`);
первый упал на разборе вывода классификатора, пробу исправили, прогоны 2–4 полные и совпадают.
Окружение шлюза — как у нынешнего `cron-runner` (мультиплекс профилей, свой каталог блокировок,
Mem0). Модель не вызывалась. После каждого прогона не осталось ни `gateway run` этого профиля,
ни `electron.exe`; шлюз Hermes владельца (`%LOCALAPPDATA%\hermes`) не трогали.

## Коротко

| Вопрос | Ответ |
|---|---|
| `gateway ensure --json` | `state: ready`, адрес `http://127.0.0.1:<порт>`, без секрета; `capabilities`: `session-authority-v1`, `durable-admission-v1`, `event-replay-v1`; `supervisor: none` |
| Готовность с холодного старта | 5,5–29,7 с (прогоны: 25,6; 5,5; 29,7; 7,7). Свой предел `ensure` — 60 с |
| Повторный `ensure` при работающем шлюзе | ≈1 с, тот же `instance_id` |
| Процесс и порты | один процесс, 222–235 МБ; два порта, оба на `127.0.0.1` (C11 соблюдается) |
| Окружение доходит до шлюза | да: блокировки легли в наш `HERMES_GATEWAY_LOCK_DIR` (`host-gateway.json`, `host-gateway.lock`). По коду (`gateway_runtime_start.py`) шлюз наследует окружение клиента `ensure` — ключи моделей доходят так же, как сейчас до `serve`, но только при запуске шлюза |
| Билеты через их клиент на Python | работают: `interactive` 166–441 мс (первый — с запуском интерпретатора), `native-http` 1–33 мс |
| Билет одноразовый | да: повторный сокет с тем же билетом не принят (ответа нет 15 с), повторный REST — 401 |
| Без билета | сокет не открывается; REST — 401 на всё, кроме открытого `/api/status` |
| Сокет | открыт с подпротоколом `hermes-gateway-v1`; первый кадр — `gateway.ready`, как у `serve` |
| Чат без модели | `session.create` — да (снимок с `revision`, `execution_generation` — канонический ответ), `session.list` — да, `session.close` — **нет** (−32601) |
| Групповые комнаты | `groups.capabilities`: `driver: true`, 16 методов — шлюз владеет комнатами сам |
| `gateway stop` | 6,5–18,5 с, код 0, «Stopped gateway for this profile»; в журнале — штатные фазы остановки («Gateway stopped», без «UNCLEANLY») |

## Методы JSON-RPC, которые зовёт окно

193 метода реестра ядра названы в коде окна (мост `main`/`preload`, донор, наши поверхности
`aec`; сгенерированный контракт донора не считается). Маршрут каждого определён таблицами ядра
и проверен вживую вызовом с пустыми параметрами; методы с внешним действием (модель, микрофон,
сеть, запуск агента — 27 штук) только классифицированы. Расхождений между таблицами и живым
ответом нет ни одного.

| Маршрут в шлюзе | Методов | Живой ответ |
|---|---|---|
| Свой обработчик шлюза (сеансовая власть) | 65 | 12 — результат, 42 — отказ по параметрам (метод есть), 11 не вызывались |
| Групповые методы | 17 | 3 — результат, 14 — отказ по параметрам |
| Прежний обработчик (запасной путь) | 96 | 45 — результат, 34 — отказ по параметрам, 16 не вызывались, `billing.step_up` молчит на пустых параметрах |
| **Не обслуживается (−32601)** | **15** | все 15 — «unknown method» |

Не обслуживаются: `session.activate`, `session.archive`, `session.branch`,
`session.branch_stored`, `session.branch_whole`, `session.close`, `session.compress`,
`session.cwd.set`, `session.delete`, `session.status`, `session.title`, `session.undo`,
`session.usage`, `session.workspace.move`, `agents.list`. Шлюз держит сеансы сам и не пускает в
них прежние обработчики (`tui_gateway/ws_legacy_fallback.py`).

Чем это закрыто:

1. **Переводит канонический адаптер донора** (`donor/api/canonical-protocol.ts`, класс
   `CanonicalDesktopProtocol`): `session.title`, `session.archive`, `session.compress`,
   `session.branch*` → `session.mutate`; `session.cwd.set`, `session.workspace.move` →
   `session.mutate operation=workspace`; `session.activate` → `session.resume`. Он же приводит
   `session.create` и `prompt.submit` к закрытым наборам ключей канонического контракта.
2. **Донор переживает отказ сам:** `session.close` — `.catch(() => undefined)`;
   `session.usage` — только запасной путь, когда нет основного; удаление сеанса — через REST.
3. **Остаётся без замены:** слеш-команда `/status` (`session.status`) покажет ошибку — так же у
   самого Hermes на этом пути («Cutover limits»).
4. **Зовёт только наш главный процесс**, и окно эти его обработчики уже не вызывает:
   `processes:list` (`agents.list`), `sessions:activate|delete|rename|branch`,
   `session:usage|compress|undo` — их вызывали наши прежние экраны чата, удалённые при переходе
   на чат донора. В T53.2 — удалить или перевести, а не чинить.

**Главное для T53.2.** Сокет у нас держит главный процесс (SPEC C9). Их клиент окна
`HermesGateway` (`donor/api/client.ts`, без правок) — подкласс, который через псевдоним
`@hermes/shared` наследует наш мост `shared/gateway-bridge`; канонический адаптер живёт в этом
подклассе и включается сам, когда адрес соединения содержит `native_dial`
(`this.canonical = this.nativeDial` в их `connect`). Сейчас наша заглушка адреса —
`ws://ipc/api/ws` (`shared/hermes-desktop-shim.ts`), поэтому адаптер выключен и вызовы идут в
прежней форме; на шлюзе это сломало бы переименование, архив, сжатие, ветки, смену каталога и
создание чата. Решение внутри модуля: на шлюзе заглушка несёт `native_dial`, адаптер донора
работает поверх моста, главный процесс только передаёт кадры и получает билеты. Архитектура и
C9 не меняются; их `socketFactory` (`openGatewaySocket`) наш мост по-прежнему не использует.

## REST с билетом `native-http`

Шлюз монтирует то же приложение, что `serve` (`hermes_cli.web_server`), поэтому набор маршрутов
тот же; меняется только вход: заголовок `X-Hermes-Gateway-Ticket`, новый билет на каждый запрос.

- 200: `/api/status`, `/api/sessions`, `/api/skills`, `/api/profiles`, `/api/env`,
  `/api/mcp/servers`, `/api/memory`, `/api/curator`, `/api/learning/graph`, `/api/config`,
  `/api/config/defaults`, `/api/config/schema`, `/api/model/info|options|auxiliary`,
  `/api/tools/toolsets`, `/api/messaging/platforms`, `/api/logs`, `/api/analytics/usage`,
  `/api/fs/default-cwd`, `/api/delegation/routing`, `/api/webhooks`, `/api/local-models/status`,
  `/api/skills/hub/sources`; запись `POST /api/fs/write-text` — 200, файл записан.
- **403 без явного профиля:** `/api/cron/jobs` и `/api/profiles/sessions/sidebar`. Билет
  `native-http` требует назвать свой профиль (`hermes_cli/dashboard_auth/native_http.py`,
  `_check_profile_scope`): с `?profile=default` и `?recents_profile=default` — 200. Донор
  передаёт профиль, когда знает его (`donor/api/cron.ts`); наши вызовы в T53.2 должны
  передавать всегда.
- 404 — маршрутов нет и у `serve`: `/api/memory/providers`, `/api/plugins`,
  `/api/desktop-plugins`, `/api/actions`; `/api/ui-preferences` закрыт для поверхностей
  `serve` и `gateway` одинаково (`web_server_surface.py`). Разницы с сегодняшним нет.
- 401: `/api/auth/me` — вход OAuth, у нас не используется.

## Итог и план обхода

Недостающее не закрывает важных поверхностей окна: всё, что пропадает, либо переводит
канонический адаптер донора, либо донор обходит сам, либо зовётся только мёртвым кодом
главного процесса. Вопрос владельцу не нужен. T53.2 включает:

1. Заглушка адреса в `hermes-desktop-shim.ts` несёт `native_dial`, когда главный процесс на
   шлюзе, — их `HermesGateway` переходит на канонический протокол поверх нашего моста.
2. Главный процесс: `gateway ensure` (предел 60 с + запас, как у них), билет на каждый сокет и
   каждый REST-запрос через их клиент на Python (интерпретатор поставки и `core_python.py`),
   `profile` во всех маршрутах расписаний и боковой панели, `gateway stop` при выходе.
3. Смена ключа модели: шлюз получает окружение только при запуске — `gateway stop` и снова
   `ensure`, как сейчас перезапуск `serve`.
4. Удалить обработчики главного процесса, которые окно не вызывает (список в пункте 4 выше).
5. `/status` — известное ограничение ядра; записать в техдолг, не обходить.
