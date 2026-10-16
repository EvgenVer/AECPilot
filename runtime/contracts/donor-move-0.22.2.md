# План повторного переноса донора 0.21.5 → 0.22.2 (задача T20.2)

Замер 2026-10-15, **до подъёма пина**. Новый тег не подтягивался в `runtime/.hermes-src`:
дерево читалось отдельным blobless-клоном в scratchpad (выкачан `v0.22.2` без `website/`),
а `donor-report` прогонялся его функциями (`buildReport`/`formatReport`/`readVendorZone`)
против того клона — те же числа, что дал бы `node runtime/donor-report.mjs <ref>` после
`fetch` в `.hermes-src`.

- **От:** `f97608f178d1ffeca59860195ab7da295f7c8e5f` (`v2026.9.24`, ядро 0.21.5) — наш пин
- **До:** `d923a5eb487a17c0a68801bba9ef0f56c81040a8` (`v0.22.2`, 15 октября)

**Почему 0.22.2.** Решение владельца 2026-10-15: пин — только стабильный `vX.Y.Z`. 0.22.1 собран
не с того коммита (в нём невыпущенная работа шлюза), 0.22.2 — то, чем он должен был быть.
`apps/desktop/package.json` больше не несёт версию десктопа: там `0.0.0`, номер приходит
штампом сборки.

## Числа

| | 0.21.5 (3.B6) | **0.22.2 (T20.7)** |
|---|---|---|
| файлов в зоне | 1246 → 1438 после переноса | **1438** (92 с нашими правками) |
| изменилось у донора | 535 | **584** |
| из них с нашими правками | 65 | **67** |
| исчезло источников | 16 | **31** (§3) |
| новых файлов донора (без тестов) | 202 | **337** в `apps/desktop/src` + `apps/shared/src` |
| новых npm-зависимостей рендерера | 1 (`@novnc/novnc`) | **не больше 1** — `lucide-react` 0.577.0 (ISC, веттинг T20.1) нужен только `app/settings/plugin-install-modal.tsx` и мёртвому `setup-beat`; `yaml` и `electron-updater` — их main-процесс, нам не нужны |
| стек | Electron 40.10.2, React 19.2.7, TS 6.0.3, Vite 8.2.0, assistant-ui 0.14.24, Tailwind 4.3.3 | **тот же** |

**Правленые файлы, изменившиеся у донора (67):** `i18n/types.ts`, `i18n/catalog.ts`,
`global.d.ts`, `styles.css`, `api/client.ts`, `api/config.ts`, `store/{projects,onboarding,gateway,prompts,wake-word}.ts`,
`app/settings/{gateway-settings,model-settings,index,uninstall-section,toolset-config-panel,appearance-settings,config-settings,constants,settings-manifest,env-credentials}`,
`app/contrib/{wiring,controller,layout-presets}`, `app/session/hooks/use-message-stream/{index,gateway-event/status,gateway-event/message-stream}`,
`app/session/hooks/{use-prompt-actions/slash,use-hermes-config}`, `app/shell/hooks/use-statusbar-items`,
`app/hooks/use-keybinds`, `app/gateway/hooks/{use-gateway-boot,use-gateway-request}`, `app/messaging/index`,
`app/chat/{index,composer/index,composer/controls}`, `app/command-palette/index`, `app/capabilities/scope-selector`,
`components/assistant-ui/{thread/assistant-message,thread/status,markdown-text}`, `components/onboarding/index`,
`components/error-boundary`, `components/pane-shell/tree/renderer/tree-group`, `contrib/{runtime-loader,plugin}`,
`sdk/index`, `lib/{desktop-slash-commands,voice-playback,desktop-fs,desktop-toolsets,error-surface}`,
`lib/keybinds/{actions,combo}`, `lib/desktop-slash-registry.json` (правка в `.provenance`), `themes/skin`,
`plugins/hermes-bots/{data,i18n,screen-pane,avatar-picker,canonical-chat,labels,group-chat,roster-pane-dialogs}`,
`plugins/kanban/i18n`, `shared/src/json-rpc-channel.ts` (правка [1]).
Самые тяжёлые: `i18n/types.ts` (+269/−386), `gateway-settings.tsx` (+122/−383), `contrib/wiring.tsx` (+219/−212),
`model-settings.tsx` (+276/−137), `global.d.ts` (+295/−91), `store/projects.ts` (+273/−42).

## Способ переноса

Тот же, что в 3.B5/3.B6:

1. **Без наших правок (~517 файлов)** — копия с нового SHA (`vendor-donor.mjs --list`).
2. **С нашими правками (67)** — копия с нового SHA и повторное наложение наборов из заголовка
   трёхсторонним `git merge-file` (база — их файл на `f97608f1`, «наши» — вендорный файл без
   шапки, «их» — файл на `d923a5eb`). Окончания строк нормализуются до слияния (ловушка 2 —
   зона хранит смешанные окончания, `git show` отдаёт LF). После слияния дифф результата
   против их новой версии сверяется с заголовком: ничего, кроме перечисленных правок (правило 3).
3. **Новые файлы** — замыкание импортов: всё, до чего дотягиваются файлы зоны, плюс новые
   поверхности по решениям §4. Гейт полноты — `build` (ловит и `../` импорты — ловушка 3).
4. **Исчезнувшие** — удаляются из зоны; ссылки нашего кода переводятся (§3).
5. **Правка [2] сужается** (решение владельца 2026-10-15, задача T20.8): русский — их каталог,
   наши термины и C12 — слоем переопределений. В T20.7 правка [2] накладывается как раньше,
   переход на их каталог — отдельной задачей T20.8, чтобы перенос и смена перевода не смешались
   в одном диффе.

## 3. Источник исчез — 31

| Было | Стало | Что у нас |
|---|---|---|
| `components/onboarding-chat/**` (13, в т.ч. `cards/setup.tsx` ✎) | снят; новый первый запуск — `components/onboarding/first-run/**`, `components/assistant-ui/setup-beat/**`, `store/onboarding-{run,phase,session,intro}.ts` | HX26: было мёртвым, остаётся мёртвым на новом месте; `DEAD_SURFACE_FILES` в `shared/i18n/no-hermes-literals.test.ts` переписывается на новые пути |
| `components/onboarding-chat/chip.tsx` | → `components/ui/chip.tsx` (R81) | берём на новом месте |
| `components/intro-reveal/**`, `store/intro-reveal.ts` | сняты (3D-заставка) | HX26: было мёртвым — строки уходят из `DEAD_SURFACE_FILES` |
| `store/onboarding-{answers,capabilities,gate,plugins,plugin-outcomes,script}.ts`, `lib/onboarding-{enabled,recommendations}.ts` | сняты, логика в `store/onboarding-*` нового первого запуска | HX26, мёртвое |
| `app/contrib/{handoff-leg,handoff-receipt}.ts` | сняты вместе с передачей онбординга в сессию | были в замыкании `contrib`; ссылки нашего кода нет |
| `app/capabilities/plugins/plugin-settings-form.tsx` | → `app/settings/plugin-settings-form.tsx` (R56) — плагины получили свою страницу настроек | берём на новом месте |
| `components/assistant-ui/clarify-tool.tsx`, `clarify-submit-shortcut.ts`, `ask-directive.tsx` | → `components/assistant-ui/clarify/**` (13 файлов; `submit-shortcut.ts` R100) | берём; это вопросы ядра к человеку (clarify) — проверить мост `server-requests` |
| `components/assistant-ui/embeds/escape-html.ts` | снят (экранирование ушло в сам рендер встраиваний) | ссылки нашего кода нет |
| `components/first-run-remote-form.tsx` | → `components/remote-setup/**` (6) | берём (удалённый режим UR20 — через наш мост, правка [1]) |
| `components/tips/local-setup-offer.ts` | → `store/local-setup-offer.ts`, `app/shell/local-setup-menu-row.tsx` | UR39 (локальные модели) — берём |
| `store/connector-catalog.ts` | снят, каталог — `app/capabilities/connectors/**` | HX3 (размещённые коннекторы) — как раньше |
| `store/machine.ts` | снят, факты машины — RPC `machine.facts` | **наш `shared/donor-members.test.ts` ссылается на него** — перевести |
| `store/tool-diffs.ts` | снят, дифф инструментов — в `store/tool-activity.ts` | берём новый |

## 4. Новые файлы донора — решения (интервью 2026-10-15)

Правило владельца 2026-09-05: что не подтверждено как «не берём» — берём. Семейства под
действующими HX вендорятся мёртвыми (вход не регистрируется), если их тянет замыкание импортов.

| Семейство | Файлы (без тестов) | Решение |
|---|---|---|
| Вопросы ядра к человеку | `components/assistant-ui/clarify/**` (13), `store/parked-card-answers.ts`, `app/chat/composer/hooks/use-card-waiting-submit.ts` | **берём** |
| Монитор субагентов, карточки Goal/Loop | `lib/session-timer-since.ts`, `store/tool-activity.ts`, `app/session/hooks/use-message-stream/interrupted-reply.ts` и правки `status.tsx`/`status-stack` | **берём** (решение 9) |
| Модели: избранное, лимиты, усилие | `store/favorite-models.ts`, `store/model-pricing.ts`, `components/provider-status-chip.tsx`, `lib/provider-limit.ts`, `lib/reasoning-step.ts`, `app/shell/model-menu-row-decorations.tsx`, `app/settings/aux-task-rows.tsx`, `stale-aux-dismissal.ts` | **берём** (решение 9) |
| Ошибки, настройки, внешний вид | `components/external-open-failed-dialog.tsx`, `lib/error-surface.ts` (✎), `store/chat-text-scale.ts`, `store/appearance-apply.ts`, `components/ui/accent-swatch.tsx`, `themes/{accents,persist-accent}.ts`, `components/assistant-ui/theme-picker/**` (5), `store/theme-pick.ts`, `app/overlays/overlay-breadcrumb-header.tsx`, `app/context-menu/shell-menu-items.tsx` | **берём**; `set_theme` агента — инструмент ядра, в списке отложенных |
| Simple / Advanced | правки `store/interface-mode`, `app/shell/**` | **берём, умолчание Advanced** (решение 10); наши панели (Индекс, Память, карта документов) видны в обоих режимах — проверка в T20.7 |
| Предпросмотр | `app/chat/right-rail/preview-*.ts` (4), `store/preview-{explicit,ownership}.ts`, `lib/preview-annotate/handoff.ts`, `lib/preview-markdown-links.ts` | **берём** (режим комментариев — решение 9) |
| Сессии и проекты | `app/session/hooks/use-session-actions/*` (5), `use-transcript-peer-sync.ts`, `store/{transcript-sync,transcript-lightbox,session-owner-holds,project-scope,project-tree,dead-session-prune}.ts`, `app/chat/sidebar/use-server-session-search.ts`, `app/shell/hooks/*` | **берём**; `dead-session-prune` проверить против `sessions.auto_prune: false` (наша история разговоров UR4) |
| Журнал и поиск | `components/chat/log-search.tsx`, `lib/log-search.ts`, `components/chat/shiki-chunk-boundary.tsx` | берём |
| Плагины ядра: страница настроек и установка | `app/settings/plugin-{settings,settings-form,install-details,install-run}.tsx/ts`, `use-plugin-probe.ts`, `plugin-install-modal.tsx`, `store/skill-deeplink-install.ts`, `lib/keybinds/plugin-actions.ts`, `sdk/{areas,i18n,plugin-contract}.ts` | **берём под гейтом доверия UR23** (решение 6): установка — только через наше окно согласия, с показом Python-зависимостей; `lucide-react` приходит с `plugin-install-modal` |
| Локальные модели | `app/settings/local-models-*.tsx/ts` (9), `local-model-download-progress.tsx`, `store/{local-model-offer,local-setup-offer}.ts`, `app/shell/local-setup-menu-row.tsx` | **берём** (UR39) |
| Удалённый режим | `components/remote-setup/**` (6) | берём, WebSocket и HTTP — через наш мост (C9, правка [1]) |
| Новый первый запуск и бесплатная модель | `components/onboarding/first-run/**` (5), `onboarding-end.tsx`, `skip-setup.tsx`, `components/assistant-ui/setup-beat/**` (5), `store/{onboarding-*,setup-beat,free-tier-challenge}.ts`, `app/settings/onboarding-settings.tsx`, `gateway-event/{onboarding,free-tier}.ts`, `app/shell/terms-butterbar.tsx` | **мёртвыми** — HX26/HX3 |
| Коннекторы Nous | `app/capabilities/connectors/{accounts-section,disconnect-confirm,hosted-notice}.tsx`, `data/{alias,hosted-actions}.ts` | **мёртвыми** — HX3 (MCP-серверы во вкладке остаются) |
| Общая телеметрия | `components/shared-metrics/**`, `app/settings/shared-metrics-settings.tsx`, `store/{shared-metrics,desktop-metrics}.ts`, `app/contrib/hooks/{use-desktop-metrics,desktop-onboarding-metrics}.ts`, `app/gateway/report-startup-latency.ts` | **мёртвыми / честный отказ** — HX31; вызовы `shared_metrics.*` не доходят до ядра (мост) |
| Каналы обновлений, версия | `app/settings/update-channel-row.tsx`, `components/{update-status,update-hold-overlay,version-details,sync-status-card}.tsx`, `lib/{version-label,distribution-label}.ts`, `app/retirement-view.tsx` | **мёртвыми** — HX4; версия ядра у нас без штампа даёт `0.0.0`: «приложение старше бэкенда» не должно появляться (проверка T20.4) |
| Голос | `lib/{voice-stream,voice-tts-echo,stt-lease,mic-meter-context}.ts` | **мёртвыми** — HX19 |
| Питомец | `store/pet-plugin-messages.ts` | **мёртвым** — HX1 |
| Специалисты (`hermes-bots`) | `edit-profile-look.ts`, `i18n-bind.ts`, `relay-budget.ts` + правки `group-chat`, `roster-pane-dialogs` | **берём** (участники группы, @имя, история 200); `screen-*` — мёртвыми (HX28), серверные комнаты `groups.*` — HX18 |
| Облачные агенты, флот | `lib/cloud-agent-session.ts`, `app/chat/sidebar/{fleet-gateway-menu-group,local-device-switch}.tsx` | **мёртвыми** — HX3/HX22 |
| Импорт сессий другого агента | не новое: `app/session-import/{api.ts,index.tsx}` вендорен ещё при 0.21.5; регистрация — `app/routes.ts` (`SESSION_IMPORT_ROUTE`, вид `session-import`), `app/command-palette/index.tsx` (команда `session-import`), `app/contrib/wiring.tsx` (`SessionImportView`) | **мёртвым** — HX30: снять маршрут, команду палитры и вид правкой [3] (таблицы регистрации); файлы семейства переносятся как есть |
| Прочее | `lib/{attachment-upload-policy,docs,gateway-health-pill,identity-trace,platform-status,quick-entry-submission,remark-soft-breaks,turn-done-notification-body}.ts`, `lib/chat-messages/attachment-turn.ts`, `lib/tour/tour-active.ts`, `app/chat/{built-in-tour,chat-surface-state,use-chat-bar-state}.ts`, `app/contrib/{wiring-effects,workspace-page-header}.ts/tsx`, `app/cron/open-cron-run.ts`, `app/messaging/allowlist-field.tsx`, `app/starmap/context-menu-handle.ts`, `app/right-sidebar/**`, `components/ui/chip.tsx`, `store/{butterbar,profile-dot-state}.ts`, `app/shell/butterbar.*`, `apps/shared/src/{catalog-install,update-debt}.ts` | берём как есть; `docs.ts` и ссылки на их сайт — проверить C12 и правку [5] |

## 5. Шимы и мост

- `global.d.ts` +295/−91 — новые члены `window.hermesDesktop`. Каждый — реализовать, объявить
  отсутствующим (`член: undefined`) или честный отказ. Гейты `void-members.test.ts` и
  `donor-members.test.ts` обязаны быть зелёными (core-facts §Донор).
- `apps/shared/src/json-rpc-channel.ts` (правка [1]) +40/−3, `json-rpc-gateway.ts` +45/−0
  (повтор кадров после переподключения) — наложить и проверить, что наш IPC-мост отвечает в той
  же форме. `gateway-contract.openrpc.json` (их машиночитаемый контракт) — переносится как
  данные; разбор контракта — T20.4.

## 6. Гейт переноса (T20.7)

`donor-report` против `v0.22.2` → «изменившихся 0, исчезнувших 0»; `pnpm -C apps/desktop build`;
typecheck, `pnpm -C apps/desktop lint` целиком (ловушка 8), prettier; vitest целиком; гейты
членов шима; e2e smoke + acceptance ≥3 зелёных на одной сборке (T20.10); реестры паритета.
