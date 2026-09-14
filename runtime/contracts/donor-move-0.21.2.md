# План повторного переноса донора 0.21.0 → 0.21.2 (задача 3.B4а)

Замер 2026-09-14, **ДО подъёма пина**. Читалось из `runtime/.hermes-src`, куда новый тег
подтянут отдельным ref'ом и НЕ выкачен: `git -C runtime/.hermes-src fetch --no-tags origin
refs/tags/v2026.9.11:refs/aecpilot/v2026.9.11`. HEAD остался на `29112bef`, `node
runtime/donor-env.mjs` отвечает нулём.

- **От:** `29112bef099274229cadff79cdff7bf7b99c4b77` (`v2026.8.31`, ядро 0.21.0) — наш пин
- **До:** `939e45c91d751fadd94dcd1b873ac3cb44846213` (`v2026.9.11`, ядро 0.21.2), 11 сентября — «The state.db Patch Release»

**Почему этот документ снимается до, а не во время подъёма.** `runtime/setup.mjs` делает
`git checkout --detach --force` в том же `runtime/.hermes-src`, а `donor-report.mjs` читает
донора именно оттуда. После переустановки «от» и «до» совпадут, и список переноса станет
пустым — не потому, что работа сделана, а потому, что сравнивать не с чем. Это свойство
инструментов, а не предпочтение.

**Порядок, решённый владельцем 2026-09-14: сначала подъём, потом ручная приёмка — один раз,
на поднятой сборке.** Разностный второй проход поэтому не нужен; раздел чек-листа «что
перепроходить после подъёма» остаётся для СЛЕДУЮЩИХ подъёмов.

## Числа

| | 0.20.5 (3.B1) | 0.20.6 (3.B2) | 0.21.0 (3.B3) | **0.21.2 (3.B4)** |
|---|---|---|---|---|
| файлов в зоне | 819 | 889 | 918 | **1078** |
| изменилось у донора | 190 | 177 | 95 | **308** |
| из них с нашими правками | 25 | 29 | 22 | **43** (из 75) |
| исчезло источников | 4 | 1 | 0 | **2** |
| новых npm-зависимостей | 2 | 0 | 0 | **1** — `qrcode@1.5.4` (+ `@types/qrcode`), нужна только экрану QR-подключения Telegram |

Окно самое дорогое из четырёх: втрое больше 0.21.0 по файлам и вдвое по наборам правок.
Причина не в возможностях, а в их перестройке: ядро разобрано на модули (`tui_gateway/`
36 → 67 модулей), в рендерере переписаны групповые ходы `hermes-bots` и каталог `i18n`.
Промежуточный релиз `v2026.9.7` стоил бы 217 файлов и 32 набора — цена растёт с каждым
релизом и упрётся в потолок 75 (все правленые файлы зоны).

## 1. 43 файла с нашими правками — 56 наборов

Порядок работы по каждому: **файл переносится заново с нового SHA, а не патчится**
(PLAN §Слой донора), затем правки накладываются по строкам заголовка ниже, затем заголовок
переписывается с новым `Commit:`. Наборы взяты из строк `Edits:` заголовка, а НЕ из
inline-маркеров.

| Файл зоны | Диф донора | Наборы правок из заголовка |
|---|---|---|
| `plugins/hermes-bots/roster-pane.tsx` | +224/−635 | [5] their product name in the delete confirmation -> ours (SPEC C12) |
| `i18n/types.ts` | +604/−18 | [3] registration table: added 'ru' (SPEC C7 — our UI is en+ru) |
| `components/pane-shell/tree/renderer/tree-group.tsx` | +228/−182 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `store/onboarding.ts` | +270/−27 | [5] their product name in user-visible strings → ours (SPEC C12)<br>[1] onboarding provider key → our safeStorage bridge (R2) |
| `app/chat/right-rail/preview-pane.tsx` | +288/−0 | [3] the input channel is registered through OUR scaling wrapper (`aec/preview-scale`): their coordinates assume zoom 1, and at any other window zoom the agent's click misses its target (finding D-74, SPEC UR36) |
| `app/skills/index.tsx` | +243/−22 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `store/gateway.ts` | +182/−48 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/gateway/hooks/use-gateway-boot.ts` | +157/−41 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `store/projects.ts` | +96/−99 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/contrib/wiring.tsx` | +167/−15 | [3] removed the pet surface (HX1)<br>[3] dropped the Send Diagnostics host — it uploads a debug bundle to Nous-internal diagnostics storage (`diagnostics.share_nous`), HX3<br>[3] dropped the credits-notice dev demo — billing (HX2)<br>[3] the wake phrase no longer starts a continuous voice conversation, and no longer raises the wake badge that only that conversation could lower — SPEC HX19 (owner decision 2026-09-08) |
| `app/session/hooks/use-prompt-actions/slash.ts` | +130/−25 | [5] their product name in user-visible strings → ours (SPEC C12)<br>[3] removed the /hatch and /pet slash commands (HX1) |
| `app/settings/model-settings.tsx` | +102/−36 | [5] their product name in user-visible strings → ours (SPEC C12)<br>[1] provider key → our safeStorage bridge instead of the core's env store (R2) |
| `global.d.ts` | +103/−26 | [4] dropped the pop-out pet overlay IPC block and its types (HX1) |
| `components/assistant-ui/thread/status.tsx` | +122/−5 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `plugins/hermes-bots/i18n.ts` | +114/−0 | [3] registration table: added 'ru', whose catalog is ours (SPEC C7, task 3D.5) — the module note below still lists en/ja/zh/zh-hant only<br>[5] their product name across the catalog's user-visible strings -> ours (SPEC C12) |
| `app/messaging/index.tsx` | +103/−10 | [5] their product name in five platform descriptions → ours (SPEC C12) |
| `app/settings/appearance-settings.tsx` | +101/−6 | [3] removed the pet settings section (HX1)<br>[3] dropped the window-translucency row and the VS Code Marketplace theme search/import (both HX14) — with their imports, derived state and the search box's second job |
| `contrib/runtime-loader.ts` | +70/−37 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/settings/gateway-settings.tsx` | +88/−18 | [5] their product name in the gateway URL placeholder → ours (SPEC C12) |
| `sdk/index.ts` | +71/−14 | [4] dropped the two `blobatar` re-exports (`blobatarSvg`, `Blobatar`) — the package is not installed; see the note at the file's end<br>[5] their product name in user-visible strings → ours (SPEC C12) |
| `app/settings/index.tsx` | +57/−27 | [3] removed the billing section (HX2) |
| `components/assistant-ui/markdown-text.tsx` | +63/−15 | [3] MarkdownLink's href dispatch registers one more of our own surfaces — the citation chip (task 2.13). Same shape as their three existing branches (media / preview / session ref): a predicate and a component, both ours, both living in aec/citations. SPEC UR3 requires a citation to open our viewer, and this table is where a link's destination is decided. |
| `styles.css` | +71/−6 | [4] dropped the 'Collapse' @font-face (their brand package is not installed) |
| `plugins/hermes-bots/avatar.tsx` | +55/−12 | [4] `blobatarSvg` declared absent — the `blobatar` package is not installed and our SDK copy does not re-export it; their own fallback path covers it<br>[3] 'blob' removed from `AVATAR_PICKER_SHAPES` — without the package the shape silently renders as a different one (HX1 soft-body faces) |
| `components/assistant-ui/thread/assistant-message.tsx` | +54/−4 | [3] removed the Send Diagnostics action — it uploads a debug bundle to Nous-internal diagnostics storage (`diagnostics.share_nous`), HX3 — with its store import and the now-unused `Upload` icon |
| `app/chat/index.tsx` | +44/−13 | [3] removed the pet surface (HX1) |
| `app/session/hooks/use-message-stream/gateway-event/status.ts` | +50/−1 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `app/chat/composer/index.tsx` | +32/−17 | [3] registered their dictation recorder directly instead of the composer-voice hook — auto-speak of replies and the continuous voice conversation are SPEC HX19 (owner decision 2026-09-08); their three hook files stay in the zone untouched and simply have no caller |
| `app/command-palette/index.tsx` | +25/−24 | [3] removed the pet page and the two pet commands (HX1) |
| `i18n/languages.ts` | +42/−1 | [3] registration table: added the 'ru' option and its aliases (SPEC C7) |
| `api/config.ts` | +27/−12 | [3] removed `revealEnvVar` — plaintext credential read-back (R2) |
| `lib/error-surface.ts` | +28/−2 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `api/client.ts` | +19/−0 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `plugins/hermes-bots/canonical-chat.ts` | +18/−1 | [5] their product name in two user-visible messages -> ours (SPEC C12) |
| `lib/desktop-slash-commands.ts` | +17/−1 | [5] their product name in user-visible strings → ours (SPEC C12)<br>[3] removed the /pet and /hatch command registrations (HX1) |
| `app/session/hooks/use-message-stream/gateway-event/message-stream.ts` | +10/−0 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `plugins/hermes-bots/group-chat.test.ts` | +6/−4 | [5] the test-side half of the same edit: these expectations PIN a user-visible string that [5] renamed in the source, so leaving them would assert that our product calls itself by their name. Only the name is substituted, and only where the source string moved with it. |
| `plugins/hermes-bots/group-chat.ts` | +6/−2 | [5] the default profile's display name -> ours (SPEC C12) |
| `app/chat/composer/controls.tsx` | +4/−2 | [5] their product name in the wake-word fallback → ours (SPEC C12)<br>[3] dropped the voice-conversation pill, the "start voice chat" primary button and the auto-speak toggle — SPEC HX19 (owner decision 2026-09-08); the per-answer "read aloud" button lives on the message, not here |
| `app/session/hooks/use-message-stream/index.ts` | +2/−2 | [5] their product name in user-visible strings → ours (SPEC C12) |
| `i18n/catalog.ts` | +3/−1 | [3] registration table: added 'ru', whose catalog is ours (SPEC C7)<br>[3] registration table: 'en' now points at our catalog too — their strings with their product name rewritten to ours (owner decision 2026-08-20) |
| `contrib/plugin.ts` | +1/−1 | [3] dropped the plugin `socket` capability (HX5 + SPEC C9) |
| `plugins/kanban/plugin.tsx` | +1/−1 | [3] the plugin `socket` capability is gone from our plugin context (HX5 + SPEC C9, see contrib/plugin.ts) — a no-op socket is passed instead, and the board falls back to its own polling |

**Места, где перенос не сводится к копированию.**

1. `app/contrib/wiring.tsx` (+167/−15) и `contrib/plugin.ts` — **таблицы регистрации**.
   Каждый новый вклад донора получает решение «регистрируем или снимаем» (задача 3.B4г);
   снятое становится строкой §Non-Goals, а не молчаливым пропуском. Здесь же проверить,
   что наша регистрация экрана вебхуков (перенесён 2026-09-10) пережила их правку.
2. `i18n/types.ts` (+604/−18) — **каталог вырос на четверть**, и он проверяется типами.
   Наша правка [3] (добавлен `ru`) накладывается заново; решение по их полному `ru.ts`
   (3855 строк, 160 упоминаний их имени) — задача 3.B4в.
3. `plugins/hermes-bots/roster-pane.tsx` (+224/−635) — самый крупный диф среди правленых:
   их роестр переписан вместе с `group-turns`/`group-rounds`/новым `group-round-members`.
   На нём стоят наши специалисты и комнаты (3C, 3D) — после переноса пробы
   `profiles-probe`, `canonical-chat-probe`, `own-chat-probe` обязательны.
4. `store/onboarding.ts` (+270/−27) — наш мастер первого запуска (`aec/onboarding`)
   импортирует этот стор; у донора появился онбординг-чат и «guided first launch» —
   решение 3.B4г, а стор переносится в любом случае.
5. `app/chat/right-rail/preview-pane.tsx` (+288/−0) — предпросмотр вырос на аннотации
   (`lib/preview-annotate/**`, новая поверхность); наша правка накладывается на
   заметно другой файл.

## 2. 252 файлов без наших правок — копируются как есть

Порядок по величине дифа. Заголовок переписывается с новым `Commit:`, тело берётся
донорское целиком.

- `plugins/hermes-bots/group-turns.ts` — +525/−257
- `i18n/en.ts` — +644/−30
- `i18n/zh.ts` — +616/−28
- `plugins/hermes-bots/group-rounds.ts` — +111/−403
- `i18n/ja.ts` — +477/−13
- `i18n/zh-hant.ts` — +457/−13
- `app/session/hooks/use-session-actions/index.ts` — +325/−87
- `components/prompt-overlays.tsx` — +345/−2
- `components/assistant-ui/thread/list.tsx` — +314/−28
- `i18n/ar.ts` — +324/−11
- `components/pane-shell/tree/renderer/tree-split.tsx` — +210/−95
- `app/chat/sidebar/index.tsx` — +139/−111
- `lib/mcp-dashboard-oauth.ts` — +188/−53
- `store/thread-scroll.ts` — +231/−6
- `store/session.ts` — +216/−16
- `app/shell/model-catalog-menu.tsx` — +196/−34
- `store/session-states.ts` — +166/−61
- `types/hermes.ts` — +213/−7
- `app/settings/plugin-install-modal.tsx` — +163/−31
- `plugins/hermes-bots/mcp-setup.tsx` — +32/−162
- `components/model-picker.tsx` — +176/−16
- `app/shell/titlebar-controls.tsx` — +99/−83
- `app/contrib/controller.tsx` — +41/−138
- `components/pane-shell/tree/store.ts` — +135/−40
- `components/onboarding/index.tsx` — +160/−14
- `components/assistant-ui/transcript-directive.tsx` — +147/−19
- `components/chat/shiki-block.tsx` — +162/−4
- `store/prompts.ts` — +139/−22
- `app/chat/sidebar/sessions-section.tsx` — +131/−26
- `lib/model-options.ts` — +120/−29
- `plugins/hermes-bots/group-chat-view.tsx` — +20/−125
- `app/chat/composer/status-stack/index.tsx` — +100/−44
- `store/updates.ts` — +103/−40
- `app/hud/hud-shell.tsx` — +30/−112
- `store/profile.ts` — +118/−23
- `app/chat/session-tile.tsx` — +117/−15
- `app/session/hooks/use-message-stream/gateway-event/input-requests.ts` — +126/−3
- `app/chat/sidebar/chrome.tsx` — +114/−9
- `app/contrib/hooks/use-background-sync.ts` — +92/−30
- `plugins/hermes-bots/roster-actions.ts` — +76/−46
- `store/composer-status.ts` — +53/−57
- `lib/chat-messages/hydration.ts` — +109/−0
- `lib/transcript-directives.ts` — +100/−3
- `i18n/context.tsx` — +79/−22
- `api/sessions.ts` — +81/−19
- `app/contrib/hooks/use-session-tile-delegate.ts` — +83/−11
- `app/shell/hooks/use-statusbar-items.tsx` — +87/−4
- `plugins/hermes-bots/bot-row.tsx` — +72/−19
- `store/layout.ts` — +64/−20
- `store/agent-plugins.ts` — +76/−7
- `app/shell/hooks/use-status-snapshot.ts` — +55/−24
- `plugins/hermes-bots/profile-ops.ts` — +41/−36
- `app/chat/sidebar/projects/overview-row.tsx` — +62/−14
- `components/chat/shiki-highlighter.tsx` — +29/−46
- `store/tips.ts` — +63/−12
- `app/chat/sidebar/projects/workspace-group.tsx` — +61/−11
- `app/session/hooks/use-session-actions/utils.ts` — +68/−3
- `components/ui/pane-tab.tsx` — +38/−33
- `app/settings/providers-settings.tsx` — +48/−22
- `plugins/hermes-bots/row-helpers.ts` — +53/−13
- `app/chat/composer/trigger-popover.tsx` — +38/−27
- `app/settings/about-settings.tsx` — +43/−20
- `lib/tour/app-tour.css` — +63/−0
- `app/chat/transcript-window.ts` — +62/−0
- `api/mcp.ts` — +25/−36
- `app/session/hooks/use-model-controls.ts` — +39/−21
- `app/session/hooks/use-session-list-actions.ts` — +48/−11
- `store/runtime-gone.ts` — +39/−19
- `app/chat/sidebar/filter-menu.tsx` — +34/−19
- `app/chat/scroll-to-bottom-button.tsx` — +36/−16
- `store/statusbar-prefs.ts` — +41/−11
- `api/messaging.ts` — +51/−0
- `app/chat/sidebar/projects/workspace-groups.ts` — +49/−2
- `app/settings/use-settings-search.ts` — +40/−11
- `app/chat/composer/model-pill.tsx` — +48/−2
- `lib/keybinds/composer-focus-keys.ts` — +48/−2
- `app/contrib/hooks/use-desktop-integrations.ts` — +45/−4
- `app/model-picker-overlay.tsx` — +45/−4
- `app/skills/mcp-tab.tsx` — +22/−26
- `themes/context.tsx` — +34/−14
- `store/subagents.ts` — +47/−0
- `hermes-shared/translucency.ts` — +10/−32
- `components/onboarding/providers.tsx` — +34/−7
- `store/voice-prefs.ts` — +13/−28
- `components/assistant-ui/thread/transcript-window.tsx` — +40/−0
- `lib/chat-messages/tool-parts.ts` — +25/−14
- `store/provider-wait.ts` — +38/−1
- `app/chat/sidebar/projects/entered-content.tsx` — +32/−5
- `app/session/hooks/use-prompt-actions/index.ts` — +8/−29
- `components/assistant-ui/thread/system-message.tsx` — +35/−2
- `store/system-actions.ts` — +32/−5
- `app/chat/composer/hooks/use-composer-draft.ts` — +28/−8
- `app/chat/right-rail/preview-browser-bar.tsx` — +36/−0
- `lib/session-date-groups.ts` — +35/−1
- `plugins/hermes-bots/group-membership.ts` — +36/−0
- `app/chat/sidebar/project-dialog.tsx` — +32/−3
- `plugins/hermes-bots/plugin.tsx` — +27/−8
- `sdk/runtime.ts` — +25/−9
- `store/session-pin-sync.ts` — +26/−7
- `app/agents/index.tsx` — +29/−3
- `lib/gateway-events.ts` — +26/−6
- `lib/spoken-reply.ts` — +32/−0
- `plugins/hermes-bots/cron.tsx` — +31/−1
- `components/pane-shell/tree/renderer/strip-visibility.ts` — +17/−14
- `lib/runtime-readiness.ts` — +31/−0
- `store/transcript-tail.ts` — +24/−7
- `app/chat/composer/hooks/use-composer-voice.ts` — +29/−1
- `app/master-detail.tsx` — +19/−11
- `app/chat/composer/hooks/use-composer-queue.ts` — +27/−2
- `app/session/hooks/use-message-stream/utils.ts` — +27/−2
- `components/tips/use-tip-rotation.ts` — +25/−4
- `app/starmap/star-map.tsx` — +9/−19
- `components/assistant-ui/clarify-tool.tsx` — +26/−2
- `plugins/hermes-bots/roster-sections.tsx` — +25/−3
- `app/contrib/session-rpc-dispatcher.ts` — +25/−2
- `app/shell/gateway-menu-panel.tsx` — +13/−14
- `components/pane-shell/workspace-scope.ts` — +27/−0
- `store/mcp-health.ts` — +24/−3
- `app/chat/right-rail/preview-file.tsx` — +2/−24
- `app/settings/primitives.tsx` — +22/−4
- `app/chat/session-drag.ts` — +5/−20
- `lib/generated-images.ts` — +18/−7
- `lib/markdown-preprocess.ts` — +2/−23
- `lib/tips/rotation.ts` — +16/−9
- `lib/model-status-label.ts` — +19/−5
- `store/suggestion-providers/mcp.ts` — +8/−16
- `components/assistant-ui/mcp-setup-tool.tsx` — +8/−15
- `components/ui/tooltip.tsx` — +12/−11
- `themes/user-themes.ts` — +1/−22
- `app/artifacts/artifact-utils.ts` — +6/−16
- `app/chat/composer/hooks/use-status-presence.ts` — +17/−5
- `store/session-request-router.ts` — +18/−4
- `themes/types.ts` — +22/−0
- `api/system.ts` — +21/−0
- `app/chat/sidebar/virtual-session-list.tsx` — +20/−1
- `lib/media.ts` — +17/−4
- `themes/backend-sync.ts` — +19/−2
- `app/chat/sidebar/section-states.tsx` — +20/−0
- `app/session/hooks/use-message-stream/gateway-event/lifecycle.ts` — +19/−1
- `lib/chat-messages/parts.ts` — +17/−3
- `lib/statusbar.tsx` — +18/−2
- `store/fleet-roster.ts` — +19/−1
- `store/goals.ts` — +16/−4
- `store/reactions-enabled.ts` — +6/−14
- `components/pane-shell/tree/renderer/tree-node.tsx` — +16/−3
- `lib/external-link.tsx` — +17/−2
- `components/tips/tip-bubble.tsx` — +17/−1
- `api/skills.ts` — +14/−3
- `app/chat/composer/focus.ts` — +14/−3
- `app/chat/composer/inline-refs.ts` — +13/−4
- `store/pane-focus.ts` — +17/−0
- `app/artifacts/index.tsx` — +10/−6
- `app/session/hooks/use-message-stream/gateway-event/desktop-bridge.ts` — +15/−1
- `app/session/session-state-cache.ts` — +15/−1
- `app/shell/model-menu-panel.tsx` — +12/−4
- `app/webhooks/index.tsx` — +9/−7
- `components/assistant-ui/thread/message-parts.tsx` — +14/−2
- `components/ui/highlight-matches.tsx` — +10/−6
- `lib/text.ts` — +16/−0
- `store/notifications.ts` — +14/−2
- `store/windows.ts` — +15/−1
- `app/chat/session-tile-actions.ts` — +13/−2
- `app/layout-constants.ts` — +11/−4
- `app/routes.ts` — +15/−0
- `app/chat/sidebar/order.ts` — +14/−0
- `app/chat/sidebar/projects/workspace-header.tsx` — +13/−1
- `app/session/hooks/use-message-stream/gateway-event/session-info.ts` — +7/−7
- `components/model-visibility-dialog.tsx` — +8/−6
- `components/pane-shell/tree/renderer/drag-session.ts` — +14/−0
- `components/pane-shell/tree/renderer/narrow-overlays.tsx` — +9/−5
- `plugins/hermes-bots/relay.ts` — +10/−4
- `store/native-notifications.ts` — +12/−2
- `vitest.setup.ts` — +14/−0
- `app/chat/composer/composer-utils.ts` — +13/−0
- `app/session/workspace-session-target.ts` — +12/−1
- `components/pane-shell/tree/renderer/index.tsx` — +11/−2
- `app/chat/chat-swap-overlay.tsx` — +12/−0
- `app/chat/composer/directive-actions.tsx` — +8/−4
- `app/chat/composer/status-stack/preview-row.tsx` — +7/−5
- `app/right-sidebar/terminal/use-terminal-session.ts` — +9/−3
- `app/session/hooks/use-prompt-actions/utils.ts` — +12/−0
- `app/shell/context-usage-panel.tsx` — +9/−3
- `app/updates-overlay.tsx` — +11/−1
- `lib/tool-render-class.ts` — +9/−3
- `plugins/kanban/drawer.tsx` — +7/−5
- `app/chat/composer/hooks/use-composer-metrics.ts` — +11/−0
- `lib/chat-messages/types.ts` — +11/−0
- `lib/embedded-images.ts` — +2/−9
- `store/gateway-switch.ts` — +10/−1
- `components/assistant-ui/tool/fallback.tsx` — +9/−1
- `plugins/hermes-bots/types.ts` — +9/−1
- `store/live-sync.ts` — +10/−0
- `app/model-visibility-overlay.tsx` — +8/−1
- `app/session/hooks/use-background-queue-drain.ts` — +7/−2
- `app/settings/settings-search.ts` — +3/−6
- `lib/renderer-loop-pause.ts` — +6/−3
- `store/plugin-install-request.ts` — +9/−0
- `store/tours.ts` — +8/−1
- `app/session/hooks/use-message-stream/gateway-event/index.ts` — +7/−1
- `components/chat/composer-dock.ts` — +6/−2
- `components/chat/status-section.tsx` — +6/−2
- `lib/budgeted-loop.ts` — +4/−4
- `store/suggestion-providers/repair.ts` — +2/−6
- `app/contrib/surfaces.tsx` — +6/−1
- `app/hud/handoff.ts` — +6/−1
- `components/pane-shell/tree/renderer/floating-panes.tsx` — +6/−1
- `hooks/use-mobile.ts` — +6/−1
- `plugins/hermes-bots/group-test-utils.ts` — +7/−0
- `store/cron-model-impact.ts` — +4/−3
- `app/chat/composer/queue-panel.tsx` — +0/−6
- `app/open-session.ts` — +6/−0
- `app/settings/searchable-select.tsx` — +5/−1
- `components/assistant-ui/thread/timeline-timestamp.tsx` — +5/−1
- `hermes.ts` — +6/−0
- `lib/artifact-detect.ts` — +5/−1
- `lib/icons.ts` — +6/−0
- `lib/preview-targets.ts` — +1/−5
- `lib/todos.ts` — +5/−1
- `lib/tour/engine.ts` — +5/−1
- `store/transcript-tail-cache.ts` — +4/−2
- `app/contrib/wiring-routing.ts` — +5/−0
- `app/session/hooks/use-prompt-actions/submit.ts` — +5/−0
- `plugins/kanban/types.ts` — +4/−1
- `store/hub-actions.ts` — +5/−0
- `app/session/hooks/use-message-stream/gateway-event/tools.ts` — +4/−0
- `app/settings/browser-real-profile-panel.tsx` — +3/−1
- `app/settings/connections-registry.tsx` — +4/−0
- `app/types.ts` — +4/−0
- `components/notifications.tsx` — +2/−2
- `components/ui/dropdown-menu.tsx` — +4/−0
- `contrib/plugins-store.ts` — +4/−0
- `plugins/hermes-bots/group-attachments.ts` — +2/−2
- `app/chat/hooks/use-composer-actions.ts` — +2/−1
- `app/settings/env-var-actions-menu.tsx` — +2/−1
- `app/chat/sidebar/projects/index.ts` — +2/−0
- `app/right-sidebar/terminal/persistent.tsx` — +1/−1
- `app/settings/combobox-input.tsx` — +1/−1
- `app/settings/config-settings.tsx` — +2/−0
- `app/settings/sessions-settings.tsx` — +1/−1
- `app/settings/types.ts` — +1/−1
- `components/assistant-ui/thread/user-message.tsx` — +1/−1
- `components/onboarding/flow.tsx` — +1/−1
- `components/ui/diff-count.tsx` — +1/−1
- `components/ui/glyph-spinner.tsx` — +1/−1
- `lib/chat-runtime.ts` — +1/−1
- `lib/tips/catalog.ts` — +0/−2
- `plugins/hermes-bots/create-dialog.tsx` — +1/−1
- `components/assistant-ui/embeds/registry.tsx` — +1/−0
- `components/assistant-ui/thread/index.tsx` — +1/−0
- `components/assistant-ui/tool/fallback-model/index.ts` — +1/−0
- `components/tips/index.tsx` — +1/−0
- `components/ui/badge.tsx` — +1/−0

Плюс 13 их тестов в зоне (`*.test.ts[x]`), те же правила:

- `plugins/hermes-bots/group-turns.test.ts` — +403/−7
- `plugins/hermes-bots/group-rounds.test.ts` — +127/−13
- `plugins/hermes-bots/profile-ops.test.ts` — +87/−2
- `plugins/hermes-bots/plugin.mentions.test.ts` — +77/−4
- `plugins/hermes-bots/cross-connection-bots.test.ts` — +43/−2
- `plugins/hermes-bots/row-helpers.test.ts` — +31/−10
- `plugins/hermes-bots/bot-row.test.tsx` — +29/−5
- `plugins/hermes-bots/group-bot-handoff.test.ts` — +26/−1
- `plugins/hermes-bots/canonical-chat-registry.test.ts` — +25/−0
- `plugins/hermes-bots/relay.test.ts` — +25/−0
- `plugins/hermes-bots/avatar.face-clock.test.ts` — +21/−0
- `plugins/hermes-bots/cron-detail.test.tsx` — +18/−1
- `plugins/hermes-bots/cron-selected-bot.test.ts` — +1/−1

## 3. Источник исчез — 2

- `app/settings/plugins-settings.tsx` ✎ **с нашими правками** ← `apps/desktop/src/app/settings/plugins-settings.tsx`
- `plugins/hermes-bots/bot-row-keeps-closed-chat.test.ts` ← `apps/desktop/src/plugins/hermes-bots/bot-row-keeps-closed-chat.test.ts`

`app/settings/plugins-settings.tsx` не удалён, а **переехал**: у донора вкладка плагинов
теперь живёт в экране навыков — `apps/desktop/src/app/skills/plugins-tab.tsx` (649 строк,
новый файл) поверх каталога плагинов с пином по SHA. Наши правки к старому файлу
разбираются поимённо и либо переезжают на новый, либо снимаются вместе с решением по
каталогу (3.B4г). `bot-row-keeps-closed-chat.test.ts` — их тест, снятый ими же; из зоны
удаляется без замены.

## 4. Новые поверхности донора — в зоне их нет, каждой нужно решение (3.B4г)

Каталоги `apps/desktop/src/**`, которых не было на нашем пине (без тестов, число файлов):

- `app/session-import` — 2
- `components/free-tier` — 2
- `components/intro-reveal` — 13
- `components/onboarding-chat` — 12
- `lib/preview-annotate` — 8
- `plugins/radio` — 2

Каталоги, исчезнувшие у донора: `plugins/accent`

По их заметкам к релизу и по дереву это: хранилище логинов/карт/адресов «Vault» с
автозаполнением браузера агентом (`agent/vault_store.py`, `vault-settings.tsx`, три
оверлея), бесплатный тариф Nous и анонимный вход (`free-tier`, `anon_auth.py`),
3D-заставка первого запуска (`intro-reveal`), онбординг-чат, каталог плагинов
(`skills/plugins-tab.tsx`, `plugin_validate.py`), интернет-радио в строке состояния
(`plugins/radio`), QR-подключение Telegram (`telegram-qr-setup.tsx`, тянет `qrcode`),
импорт сессий из других инструментов (`session-import`), панель управления сессией
(`session-control`), аннотации предпросмотра (`preview-annotate`), настройки локальных
моделей, ресурсы машины в строке состояния.

## 5. Ядро — что уже известно до чтения контракта (3.B4б)

Проверено по тому, что зовёт наш `main/index.ts`, на `refs/aecpilot/v2026.9.11`:
45 из 45 методов шлюза на месте, 12 из 12 REST-маршрутов на месте; первый замер давал 42 — «исчезли
`learning.delete`, `learning.detail`, `learning.edit`» — **ложная находка, снята 3.B4б
2026-09-14**: они регистрируются циклом `_rpc(f"learning.{_name}", …)`, и живой реестр
показывает 45 из 45 (`reading-0.21.2.md` §0). Контракт памяти цел (`memory_manager.sync_all`,
ABC `memory_provider`, `background_review`, плагин `mem0`), но **плагин Mem0 переписан**
(−4404/+2117 строк по `plugins/memory/mem0/`), поэтому пять проб памяти и `memory-config.mjs`
перепроверяются на живом ядре. `compat_manifest.json` (12 552 строки) не изменился с 9.7 —
перестройка не закончена; в дереве релиза лежит мусор тестов (`MagicMock/`, 6 файлов).

## 6. Гейт переноса

Прежний и по прежней причине: **`pnpm -C apps/desktop build`**, а не `typecheck`. Замер
3.B0: `tsc` не резолвит импорты ради побочного эффекта (`import '@/store/...'` без имён),
типизация остаётся чистой на двух ненайденных модулях, и падает уже сборка. Плюс ловушка из
3.B2: проверка полноты переноса по `@/…` не видит относительных `../…` — сборка ловит оба.

Вторая ловушка того же подъёма: **зона хранит смешанные окончания строк, а `git show` всегда
отдаёт LF**. Без нормализации трёхсторонний merge выдаёт «конфликты во весь файл», которых
нет.

После переноса — три реестра паритета по нулю (`pnpm parity`), vitest/e2e/pytest, пробы на
новом ядре, и только потом ручная приёмка владельца.

