# План повторного переноса донора 0.20.6 → 0.21.0 (задача 3.B3а)

Замер 2026-09-01, **ДО подъёма пина**. Читалось из `runtime/.hermes-src`, куда новый тег
подтянут отдельным ref'ом и НЕ выкачен: `git -C runtime/.hermes-src fetch --depth=1
--no-tags origin refs/tags/v2026.8.31:refs/aecpilot/v2026.8.31`. HEAD остался на
`5fc308a7`, `node runtime/donor-env.mjs` отвечает нулём.

- **От:** `5fc308a70719a83cccdbba4c0e39c23f5a8239d5` (`v2026.8.27`, ядро 0.20.6) — наш пин
- **До:** `29112bef099274229cadff79cdff7bf7b99c4b77` (`v2026.8.31`, ядро 0.21.0), 31 августа

**Почему этот документ снимается до, а не во время подъёма.** `runtime/setup.mjs` делает
`git checkout --detach --force` в том же `runtime/.hermes-src`, а `donor-report.mjs` читает
донора именно оттуда. После переустановки «от» и «до» совпадут, и список переноса станет
пустым — не потому, что работа сделана, а потому, что сравнивать не с чем. Это свойство
инструментов, а не предпочтение; отсюда `dep: —` у задачи 3.B3а.

## Числа

| | 0.20.5 (3.B1) | 0.20.6 (3.B2) | **0.21.0 (3.B3)** |
|---|---|---|---|
| файлов в зоне | 819 | 889 | **918** |
| изменилось у донора | 190 | 177 | **95** |
| из них с нашими правками | 25 | 29 | **22** |
| исчезло источников | 4 | 1 | **0** |
| новых npm-зависимостей | 2 | 0 | **0** |

Окно самое лёгкое из трёх, и лёгкое оно по той причине, которая для повторного переноса
единственно важна: **структурного переезда нет**. Ни один файл зоны не потерял источник, ни
один каталог не развалился на другие (сравнить с `hermes.ts` → `api/**` при 3.B1). Значит
разбирать поимённо нечего, и весь перенос механический: 73 файла копируются, у 22
восстанавливаются правки по заголовкам.

## 1. Двадцать два файла с нашими правками — 28 наборов

Порядок работы по каждому: **файл переносится заново с нового SHA, а не патчится**
(PLAN §Слой донора), затем правки накладываются по строкам заголовка ниже, затем заголовок
переписывается с новым `Commit:`. Наборы взяты из строк `Edits:` заголовка, а НЕ из
inline-маркеров: у правок вида [4] («снят импорт, которого у нас нет») маркера в теле не
остаётся, и счёт по маркерам недосчитывает.

| Файл зоны | Диф донора | Наборы правок из заголовка |
|---|---|---|
| `lib/desktop-slash-commands.ts` | +147/−90 | [5] their product name in user-visible strings → ours (SPEC C12)<br>[3] removed the /pet and /hatch command registrations (HX1) |
| `sdk/index.ts` | +182/−29 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `store/gateway.ts` | +79/−0 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/settings/appearance-settings.tsx` | +57/−0 | [3] removed the pet settings section (HX1)<br>[3] dropped the window-translucency row and the VS Code Marketplace theme |
| `app/contrib/wiring.tsx` | +29/−25 | [3] dropped the agents/Command Center/webhooks surfaces (N10, UR19)<br>[3] removed the pet surface (HX1)<br>[3] dropped the Send Diagnostics host — it uploads a debug bundle to |
| `styles.css` | +53/−1 | [4] dropped the 'Collapse' @font-face (their brand package is not installed) |
| `components/pane-shell/tree/renderer/tree-group.tsx` | +28/−18 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `api/client.ts` | +21/−15 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/session/hooks/use-message-stream/gateway-event/desktop-bridge.ts` | +34/−1 | [3] removed the `tour.request` branch (agent walking the interface, HX16)<br>[3] removed the `preview.act.request` branch and its engine loader<br>[4] dropped the imports of both engines |
| `app/settings/config-settings.tsx` | +30/−5 | [3] Убрана строка «запретить F12»: служебная механика без сценария |
| `contrib/plugin.ts` | +35/−0 | [3] dropped the plugin `socket` capability (HX5 + SPEC C9) |
| `app/session/hooks/use-message-stream/index.ts` | +23/−5 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/chat/index.tsx` | +20/−7 | [3] removed the pet surface (HX1) |
| `i18n/types.ts` | +25/−0 | [3] registration table: added 'ru' (SPEC C7 — our UI is en+ru) |
| `global.d.ts` | +16/−1 | [4] dropped the pop-out pet overlay IPC block and its types (HX1) |
| `components/chat/intro.tsx` | +3/−11 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `api/config.ts` | +12/−0 | [3] removed `revealEnvVar` — plaintext credential read-back (R2) |
| `app/command-palette/index.tsx` | +4/−7 | [3] removed the pet page and the two pet commands (HX1) |
| `components/assistant-ui/markdown-text.tsx` | +10/−0 | [3] MarkdownLink's href dispatch registers one more of our own surfaces — |
| `app/session/hooks/use-message-stream/gateway-event/status.ts` | +3/−3 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/skills/index.tsx` | +5/−0 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/settings/constants.ts` | +1/−1 | [5] their product name in user-visible strings → ours (SPEC C12) |

**Три места, где перенос не сводится к копированию, и их надо держать в голове.**

1. `app/contrib/wiring.tsx` и `contrib/plugin.ts` — **таблицы регистрации**. Их диф
   (+29/−25 и +35/−0) означает, что у донора появились новые вклады; каждый из них при
   переносе получает решение «регистрируем или снимаем», и снятое становится строкой
   §Non-Goals, а не молчаливым пропуском. Именно сюда встают решения 2026-09-01 по todos и
   tips (задачи 3.B3д и 3.B3е).
2. `app/session/hooks/use-message-stream/gateway-event/desktop-bridge.ts` несёт **три**
   набора правок сразу ([3] `tour.request`, [3] `preview.act.request`, [4] снятые импорты
   обоих движков) и вырос на +34. Событий у ядра стало 42 вместо 40 — новые `todo.updated`
   и `btw.complete` приходят ровно этим путём, и решение по ним принимается здесь же.
3. `lib/desktop-slash-commands.ts` — самый крупный диф (+147/−90) при двух наборах правок
   ([5] имя продукта, [3] снятые команды `/pet` и `/hatch`). Крупный диф + снятые
   регистрации = место, где легче всего вернуть питомца обратно, не заметив.

## 2. Семьдесят три файла без наших правок — копируются как есть

Порядок по величине дифа. Ни один не требует решения: заголовок переписывается с новым
`Commit:`, тело берётся донорское целиком.

- `store/session-states.ts` — +250/−6
- `lib/todos.ts` — +181/−1
- `app/hud/composer-drag.ts` — +61/−39
- `components/pane-shell/workspace-scope.ts` — +16/−83
- `app/session/hooks/use-session-actions/index.ts` — +80/−9
- `store/todos.ts` — +74/−9
- `i18n/en.ts` — +72/−9
- `i18n/ja.ts` — +65/−2
- `i18n/zh-hant.ts` — +64/−2
- `i18n/zh.ts` — +64/−2
- `app/session/hooks/use-message-stream/gateway-event/session-info.ts` — +44/−21
- `app/chat/sidebar/chrome.tsx` — +23/−39
- `app/chat/composer/index.tsx` — +47/−9
- `i18n/ar.ts` — +54/−2
- `app/chat/composer/hooks/use-slash-completions.ts` — +28/−26
- `app/contrib/hooks/use-session-tile-delegate.ts` — +48/−4
- `store/profile.ts` — +34/−18
- `components/ui/popover.tsx` — +42/−8
- `store/session-unread.ts` — +33/−17
- `app/chat/composer/composer-utils.ts` — +44/−0
- `components/chat/preview-attachment.tsx` — +43/−1
- `components/boot-failure-overlay.tsx` — +35/−6
- `store/session.ts` — +40/−0
- `components/assistant-ui/thread/list.tsx` — +26/−13
- `lib/use-session-slice.ts` — +39/−0
- `app/settings/helpers.ts` — +37/−0
- `lib/katex-memo.ts` — +3/−34
- `api/sessions.ts` — +31/−4
- `app/chat/thread-loading.ts` — +34/−0
- `lib/voice-client-direct.ts` — +31/−1
- `app/chat/pane-mirror.ts` — +4/−26
- `app/right-sidebar/files/use-project-tree.ts` — +22/−6
- `app/session/hooks/use-session-state-cache.ts` — +23/−4
- `components/pane-shell/tree/renderer/strip-visibility.ts` — +19/−6
- `components/pane-shell/tree/renderer/track-model.ts` — +23/−2
- `lib/mcp-servers.ts` — +21/−2
- `store/composer-status.ts` — +19/−3
- `app/chat/sidebar/connection-glyph.tsx` — +15/−5
- `app/command-center/index.tsx` — +17/−2
- `contrib/types.ts` — +4/−15
- `app/chat/sidebar/index.tsx` — +17/−1
- `lib/external-link.tsx` — +16/−2
- `themes/context.tsx` — +16/−1
- `app/session/hooks/use-prompt-actions/submit.ts` — +13/−3
- `app/chat/sidebar/profile-switcher.tsx` — +13/−2
- `components/pane-shell/tree/store.ts` — +13/−1
- `app/chat/composer/model-pill.tsx` — +12/−1
- `components/assistant-ui/inline-preview-directive.tsx` — +8/−5
- `app/contrib/controller.tsx` — +6/−6
- `app/types.ts` — +11/−0
- `components/assistant-ui/thread/index.tsx` — +9/−2
- `components/pane-shell/tree/renderer/tree-split.tsx` — +3/−8
- `app/chat/composer/status-stack/status-row.tsx` — +9/−1
- `app/context-menu/app-context-menu.tsx` — +6/−4
- `api/profiles.ts` — +4/−5
- `app/session/hooks/use-message-stream/gateway-event/tools.ts` — +9/−0
- `components/assistant-ui/tool/fallback.tsx` — +7/−2
- `app/hud/hud-shell.tsx` — +7/−1
- `app/shell/titlebar-controls.tsx` — +7/−1
- `components/ui/pane-tab.tsx` — +4/−4
- `store/compaction.ts` — +8/−0
- `store/mcp-health.ts` — +4/−4
- `app/profiles/delete-profile-dialog.tsx` — +6/−0
- `lib/chat-messages/parts.ts` — +6/−0
- `lib/chat-messages/types.ts` — +5/−1
- `types/hermes.ts` — +6/−0
- `app/session/hooks/use-message-stream/gateway-event/index.ts` — +2/−2
- `components/assistant-ui/tool/delegate.tsx` — +2/−2
- `components/chat/scaffold-row.tsx` — +4/−0
- `components/chat/status-section.tsx` — +2/−2
- `app/chat/composer/hooks/use-live-completion-adapter.ts` — +3/−0
- `app/chat/session-tile.tsx` — +0/−2
- `app/chat/route-tile.tsx` — +0/−1

## 3. Исчезнувших источников — ноль

Проверено выводом `donor-report.mjs`: раздел «исчез источник» пуст. Это первое окно из трёх,
где так. При 3.B1 таких файлов было четыре и один из них нёс наши правки; при 3.B2 — один.
Практическое следствие: **раздела «разобрать поимённо» в этом плане нет**, и его отсутствие
измерено, а не предположено.

## 4. Что приезжает в зону ВПЕРВЫЕ

Решения владельца 2026-09-01 («todos и tips берём») требуют добавить в зону файлы, которых
в ней не было. Заголовки им пишутся с нуля, `Edits: none`, если правка не понадобится.

**tips — восемь файлов, все новые:**

- `components/tips/index.tsx`
- `components/tips/tip-bubble.tsx`
- `components/tips/tips.css`
- `components/tips/use-tip-rotation.ts`
- `lib/tips/anchor.ts`
- `lib/tips/catalog.ts`
- `lib/tips/rotation.ts`
- `store/tips.ts`

`lib/tips/catalog.ts` — единственный из восьми, который почти наверняка потребует правки:
это текст подсказок, то есть видимые человеку строки (C12 — имя продукта) и ссылки на
экраны, часть которых у нас исключена. Разбирается поимённо задачей 3.B3е.

**todos — файлов добавлять не надо.** `lib/todos.ts` и `store/todos.ts` уже в зоне и просто
растут (+181/−1 и +74/−9); работа 3.B3д — проводка события `todo.updated` через мост и
регистрация поверхности, а не перенос.

**`prompt.btw` в зону не приезжает вовсе.** Их клиент этого метода не зовёт (проверено:
вызовов нет во всём `apps/desktop/src`), поэтому поверхность пишется в `renderer/src/aec/**`
своим кодом — задача 3.B3ж.

## 5. Гейт переноса

Прежний и по прежней причине: **`pnpm -C apps/desktop build`**, а не `typecheck`. Замер
3.B0: `tsc` не резолвит импорты ради побочного эффекта (`import '@/store/...'` без имён),
типизация остаётся чистой на двух ненайденных модулях, и падает уже сборка. Плюс ловушка из
3.B2: проверка полноты переноса по `@/…` не видит относительных `../…` — сборка ловит оба.

Вторая ловушка того же подъёма, здесь она сработает снова: **зона хранит смешанные окончания
строк, а `git show` всегда отдаёт LF**. Без нормализации трёхсторонний merge выдаёт
«конфликты во весь файл», которых нет.
