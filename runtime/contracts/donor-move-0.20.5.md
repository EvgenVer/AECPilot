# Структурный переезд донора 0.20.4 → 0.20.5 (задача 3.B1а)

Замер 2026-08-23, ДО подъёма пина. Читалось из клона по ref: `runtime/.hermes-src`
держит `v2026.8.19` после `git fetch --tags`, HEAD не двигался, `node runtime/donor-env.mjs`
отвечает `e624e9fd` и выходит нулём.

- **От:** `e624e9fde561e1add9388384012b295fde669ade` (`v2026.8.18`, ядро 0.20.4) — наш пин
- **До:** `fcbd1076a93841fa88855acce810e342a5b78101` (`v2026.8.19`, ядро 0.20.5), 21 августа

Задача этого документа одна: сделать подъём (3.B1) механическим. Механическим он будет,
только если непонятное разобрано заранее, а непонятного ровно два вида — **куда переехали
наши правки в развалившемся `hermes.ts`** и **что стало с четырьмя файлами, у которых
исчез источник**. Остальные 187 файлов копируются.

Правило, ради которого всё это: вендорный файл при обновлении **переносится заново с нового
SHA, а не патчится**, а диф наших правок восстанавливается по заголовку файла
(`PLAN.md` §Слой донора). Заголовок, ссылающийся на файл, которого больше нет, этого не
даёт — значит место правки надо назвать до, а не в процессе.

---

## 1. `hermes.ts` развалился на каталог `api/**`

Их файл: **2194 строки → 130**. Наша копия — 2147 (разница ровно на вырезанное правками).
Реализация уехала в 12 новых файлов `api/{client,config,cron,mcp,messaging,models,plugins,
profiles,sessions,skills,system,toolsets}.ts`, а сам `hermes.ts` стал **баррелем ради
совместимости**: их собственный комментарий в первой строке называет это так, и все импорты
`@/hermes` продолжают работать без изменений.

Барраль экспортирует через `export * from './api/…'` — **поимённых списков значений в нём
нет** (проверено: `pluginSocket` и `revealEnvVar` в тексте барреля не встречаются вовсе).
Отсюда прямое следствие: удаление символа из файла-реализации не требует правки барреля.

### Куда переезжает каждая из трёх наших правок

| Наша правка (заголовок `donor/hermes.ts`) | Новое место | Строка их кода |
|---|---|---|
| `[3]` удалён `revealEnvVar` — чтение секрета открытым текстом (R2) | `api/config.ts` | `:127` `export function revealEnvVar(key: string, profile?: ProfileScope)` |
| `[3]` удалён `pluginSocket` (каталог плагинов — HX5) **и осиротевший импорт** `reconnectBackoffDelayMs` | `api/plugins.ts` | `:76` `export function pluginSocket(...)`, импорт на `:2` |
| `[5]` имя продукта в видимой строке (SPEC C12) | `api/plugins.ts` | `:55` `throw new Error('Hermes desktop bridge unavailable')` |

**Итог для `hermes.ts`: после переноса он становится `Edits: none`** — 130 строк
реэкспорта, побайтово донорских. Три правки переезжают в два новых файла, и оба этих файла
приезжают в зону впервые, то есть их заголовки пишутся с нуля.

Проверка при переносе: осиротевший импорт `reconnectBackoffDelayMs` в `api/plugins.ts`
стоит на строке 2 и используется **только** внутри `pluginSocket` (`:116`). Удаляем
функцию — удаляем и импорт, как и в прежнем файле. Если у него появится второй потребитель,
импорт остаётся, и в заголовке это надо записать.

---

## 2. Четыре файла без источника

### 2.1 `app/session/hooks/use-message-stream/gateway-event.ts` — **с нашими правками**

Стал каталогом `gateway-event/` из девяти файлов (`index`, `desktop-bridge`,
`input-requests`, `lifecycle`, `message-stream`, `session-info`, `status`, `tools`,
`types`). Не удалён — разрезан.

Наша правка одна, вида `[5]`, и в ней **три места**:

| Наша строка | Новое место |
|---|---|
| `:1005` `… \|\| 'AECPilot reported an error'` | `gateway-event/message-stream.ts:343` |
| `:1536` `payload?.message \|\| 'AECPilot reported an error'` | `gateway-event/status.ts:121` |
| `:1574` `title: 'AECPilot error'` | `gateway-event/status.ts:159` |

**Не правим:** `gateway-event/message-stream.ts:29` — там `"Hermes error"` стоит **в
комментарии**, а правка вида 5 разрешена только в тексте, который видит человек. Это не
придирка: комментарий описывает ИХ поведение, и переименование в нём сделало бы заголовок
файла ложью при следующем переносе.

**Четвёртое место того же текста уже покрыто и переезда не требует:**
`use-message-stream/index.ts:788` у них / `:797` у нас (разница — девять строк нашего
заголовка происхождения). Файл в списке изменившихся не значится, и это подтверждается
арифметикой: 788 + 9 = 797.

### 2.2 `app/chat/right-rail/preview-strip-tools.tsx` — разрезан, не удалён

Экспортировал четыре имени. В 0.20.5 они разошлись:

| Их имя (0.20.4) | Где в 0.20.5 |
|---|---|
| `previewConsoleState` | `app/chat/right-rail/preview-console-store.ts:15` |
| `forgetPreviewStripTools` | там же, под именем `forgetPreviewConsole` (`:31`) |
| `registerPreviewDevTools`, `previewStripTools` | ушли к потребителю: `PaneStripTool` теперь фигурирует в `components/ui/pane-tab.tsx` и `preview-pane.tsx` |

Оба потребителя — `preview-pane.tsx` (+311/−18) и `components/ui/pane-tab.tsx` (+55/−6) —
и так стоят в списке повторного переноса, поэтому новые импорты приедут сами. Наших правок
в этом файле не было.

### 2.3 `app/shell/shell-context-menu.tsx` → `app/context-menu/**`

`ShellContextMenu` стал `AppContextMenu` в новом каталоге `app/context-menu/` (4 файла:
`app-context-menu.tsx`, `store.ts`, `target.ts`, тест). Единственный потребитель —
`app/contrib/controller.tsx`, он в списке переноса (+128/−58), значит импорт приедет с ним.
Наших правок не было.

### 2.4 `lib/chat-messages.ts` → `lib/chat-messages/**`

Файл на 1486 строк стал каталогом из шести (`hydration`, `parts`, `reconciliation`,
`tool-parts`, `types`, `index`). `index.ts` — барраль **с теми же именами**
(`toChatMessages`, `ChatMessage`, `ChatMessagePart`, `GatewayEventPayload`,
`TimelinePartMetadata` и прочие), поэтому импорты `@/lib/chat-messages` не меняются.
Наших правок не было. Перенос механический: удалить файл, привезти каталог.

---

## 3. Побочная находка: висячая ссылка в НАШЕМ файле

`renderer/src/aec/core-notices/core-notices-pure.ts:5` в комментарии ссылается на
`donor/app/session/hooks/use-message-stream/gateway-event.ts`. Файла после подъёма не будет.
Кода это не ломает (ссылка в тексте), но комментарий, указывающий в пустоту, — это
инструкция, которая соврёт следующему читателю. Поправить в 3.B1 вместе с переносом.

Проверено, что этим всё и ограничивается: ни один файл в `aec/**`, `shared/**` и `main/**`
не **импортирует** ни один из четырёх исчезнувших модулей.

---

## 4. Двадцать пять файлов с правками — что именно переналагать

Из 190 изменившихся у донора файлов наши правки несут 25. Перенос остальных 165 —
копирование.

| Файл | Виды правок |
|---|---|
| `app/chat/composer/controls.tsx` | [5] |
| `app/chat/index.tsx` | [3] |
| `app/command-palette/index.tsx` | [3] |
| `app/contrib/wiring.tsx` | [3] |
| `app/learning/archive-skill-confirm-dialog.tsx` | [5] |
| `app/session/hooks/use-message-stream/gateway-event.ts` | [5] — **переезд, §2.1** |
| `app/session/hooks/use-prompt-actions/slash.ts` | [3], [5] |
| `app/settings/appearance-settings.tsx` | [3] |
| `app/settings/config-settings.tsx` | [3] |
| `app/settings/env-credentials.tsx` | [3] |
| `app/settings/index.tsx` | [3] |
| `app/settings/plugins-settings.tsx` | [5] |
| `app/settings/toolset-config-panel.tsx` | [3] |
| `app/skills/index.tsx` | [5] |
| `components/assistant-ui/markdown-text.tsx` | [3] |
| `components/assistant-ui/thread/status.tsx` | [5] |
| `components/pane-shell/tree/renderer/tree-group.tsx` | [5] |
| `contrib/plugin.ts` | [3] |
| `hermes.ts` | [3], [5] — **переезд, §1** |
| `i18n/types.ts` | [3] |
| `lib/desktop-fs.ts` | [5] |
| `lib/desktop-git.ts` | [5] |
| `sdk/index.ts` | [5] |
| `store/gateway.ts` | [5] |
| `store/projects.ts` | [5] |

Крупнейшие по объёму изменений среди них — `sdk/index.ts` (+406/−31),
`app/command-palette/index.tsx` (+295/−55), `app/settings/appearance-settings.tsx`
(+189/−97), `store/projects.ts` (+171/−53). Правки в них вида [5] и [3], то есть точечные;
объём изменений влияет на то, сколько текста вокруг переехало, а не на сложность правки.

---

## 5. Вывод: размер 3.B1

Разбора требовали два узла, и оба оказались **переездом, а не потерей**: код никуда не
делся, он разрезан на файлы. Ни одной правки не пришлось переосмысливать — у каждой из
четырёх (три в `hermes.ts`, одна в трёх местах `gateway-event.ts`) назван файл-приёмник и
строка их кода.

Отсюда состав 3.B1 после Vibe Diff:

1. поднять `HERMES_SHA`/`HERMES_TAG`/`HERMES_VERSION` и переустановить ядро;
2. снять слепок, прогнать `contract-diff`, разобрать построчно — **третья категория
   обязательна**: `hermes_cli/config.py` изменился на 223 строки, а молча сменившееся
   умолчание в списках методов и маршрутов не видно по определению;
3. перенести заново 190 файлов; из них 165 — копирование, 25 — с переналожением правок;
4. `hermes.ts` заменить баррелем (`Edits: none`), привезти `api/**`, завести заголовки
   `api/config.ts` и `api/plugins.ts` с правками из §1;
5. четыре исчезнувших файла удалить, привезти их преемников (§2), поправить висячий
   комментарий в `core-notices-pure.ts` (§3);
6. гейт — **`pnpm -C apps/desktop build`**, а не только `typecheck` (замер 3.B0: `tsc`
   пропускает импорты ради побочного эффекта);
7. `donor-report.mjs v2026.8.19` должен дать «изменившихся 0, исчезнувших 0».

Чего в 3.B1 **нет** и почему: переезда питоновских зависимостей (в `uv.lock` ни одного
нового пакета, `requires-python` тот же — в отличие от 3.B0, где отдельной задачей ехал
MCP 2.x); правки под новые методы шлюза (`tour.respond`, `preview.act.respond` исключены
решением владельца, SPEC HX16/HX17 — задача 3.B1б); правки под их реестр подключений
(задача 3.B1в).
