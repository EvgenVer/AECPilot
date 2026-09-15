# План повторного переноса донора 0.21.2 → 0.21.3 (задача 3.B5а)

Замер 2026-09-15, **ДО подъёма пина**. Читалось из `runtime/.hermes-src`, куда новый тег
подтянут отдельным ref'ом и НЕ выкачен: `git -C runtime/.hermes-src fetch --depth=1 --no-tags
origin refs/tags/v2026.9.14:refs/aecpilot/v2026.9.14`. HEAD остался на `939e45c9`. Для
чтения содержимого (не только имён) взят `git worktree` на `345cd2b0` в `%TEMP%/hermes-0.21.3-wt`
— так же, как в 3.B4 для старой ревизии; снимается после подъёма.

- **От:** `939e45c91d751fadd94dcd1b873ac3cb44846213` (`v2026.9.11`, ядро 0.21.2) — наш пин
- **До:** `345cd2b057a452236de401d3534b8502a7465e8d` (`v2026.9.14`, ядро 0.21.3), 14 сентября

**Что это за релиз.** Прямой потомок нашего пина, **1039 коммитов** за три дня (main у них
идёт ~350 коммитов в сутки). Тело релизного коммита: «Rollup patch tag so Hermes Cloud agents
pick up #110061 … Full curated notes for the window ship with v0.22.0». То есть срез main
ради их облака, курируемых нот нет — тот же класс релиза, что 9.7 и 9.11. Правило пина
(«последний доступный тег») действует; решение владельца 2026-09-15 — поднимать сейчас,
пока ручная приёмка невозможна, а не ждать 0.22.0.

**Почему документ снимается до подъёма** — как в 3.B4: `setup.mjs` делает `git checkout
--detach --force` в том же `runtime/.hermes-src`, и после переустановки «от» и «до» совпадут.

## Числа

| | 0.21.0 (3.B3) | 0.21.2 (3.B4) | **0.21.3 (3.B5)** |
|---|---|---|---|
| файлов в зоне | 918 | 1078 | **1193** (74 с нашими правками) |
| изменилось у донора | 95 | 308 | **188** |
| из них с нашими правками | 22 | 43 | **25** (37 наборов правок) |
| исчезло источников | 0 | 2 | **3** — все переехали в `apps/shared` |
| новых файлов донора | — | ~20 | **25** в `apps/desktop/src` + **14** в `apps/shared/src` (без тестов) |
| новых npm-зависимостей донора | 0 | 1 (`qrcode`) | **0** — `apps/desktop/package.json` без изменений |
| новых зависимостей ядра (Python) | 0 | 0 | **1 в базе** — `pillow-heif>=1.4.0,<2` (+ extra `google-chat`, не наш) |
| инструменты / наборы / каналы ядра | — | 95 / 60 / 33 | **95 / 60 / 33 — без изменений** (замерено `readToolsets`/`readPlatforms` по дереву 0.21.3) |

## 1. 25 файлов с нашими правками — 37 наборов

Порядок — по объёму их диффа. Набор правок берётся из заголовка файла; при переносе
файл копируется заново с `345cd2b0` и набор накладывается поверх.

| Файл | Их дифф | Наши наборы | Что изменилось у них (для повторного наложения) |
|---|---|---|---|
| `app/settings/model-settings.tsx` | +110/−53 | [5] имя, [1] ключ провайдера → safeStorage | экран моделей перестроен (reasoning-пилюля, `use-model-menu-controller`) |
| `lib/desktop-slash-commands.ts` | +42/−55 | [5] имя, [3] снять /pet и /hatch | команды переехали в `lib/desktop-slash-registry.json` — [3] накладывается на JSON |
| `i18n/types.ts` | +84/−3 | [3] регистрация `ru` | +84 ключа — новые строки приедут в `bots-ru.ts`/переопределения по типам |
| `app/chat/composer/index.tsx` | +55/−1 | [3] диктовка вместо composer-voice (HX19) | +55: вход «живого голоса» — **снимается тем же [3]** (решение 2026-09-15, HX19) |
| `app/chat/index.tsx` | +40/−7 | [3] снять питомца (HX1) | |
| `sdk/index.ts` | +28/−17 | [4] blobatar, [5] имя | **канал server-requests** — стык с нашим мостом [1], см. §5 |
| `app/settings/constants.ts` | +39/−3 | [5] имя | |
| `app/messaging/index.tsx` | +33/−8 | [5] имя в описаниях платформ | |
| `store/gateway.ts` | +32/−2 | [5] имя | `gateway_shared_with` (их мультиплексор) |
| `app/chat/composer/controls.tsx` | +10/−17 | [5] имя, [3] снять голосовой разговор (HX19) | `start-voice-button.tsx` — новый вход того же режима, **снимается [3]** |
| `store/onboarding.ts` | +22/−2 | [5] имя, [1] ключ → safeStorage | |
| `app/gateway/hooks/use-gateway-boot.ts` | +20/−3 | [5] имя | |
| `app/session/hooks/use-message-stream/index.ts` | +16/−0 | [5] имя | подключение `server-requests.ts` вместо `input-requests.ts` |
| `themes/skin.ts` | +5/−4 | [5] имя | пресеты уехали в `apps/shared/theme-presets.ts` |
| `app/settings/uninstall-section.tsx` | +5/−3 | [5] имя | |
| `app/contrib/wiring.tsx` | +5/−1 | [3] ×4 (питомец, диагностика Nous, кредиты, …) | |
| `app/settings/appearance-settings.tsx` | +4/−2 | [3] ×2 (питомец, прозрачность/маркетплейс HX14) | |
| `…/gateway-event/message-stream.ts` | +5/−0 | [5] имя | |
| `global.d.ts` | +4/−0 | [4] IPC питомца | |
| `api/plugins.ts` | +2/−1 | [5] имя, [3] `pluginSocket` (HX5) | `reconnectBackoffDelayMs` теперь из `apps/shared` |
| `app/chat/composer/voice-menu.tsx` | +3/−0 | [3] снять «начать голосовой разговор» (HX19) | новые строки движков live — **снимаются [3]** |
| `app/session/hooks/use-hermes-config.ts` | +3/−0 | [3] снять `applyAutoSpeakFromConfig` (HX19) | |
| `app/session/hooks/use-prompt-actions/slash.ts` | +2/−1 | [5] имя, [3] /hatch и /pet | |
| `components/assistant-ui/markdown-text.tsx` | +2/−1 | [3] наша фишка цитаты (2.13) | |
| `app/skills/index.tsx` | +1/−1 | [5] имя | |

## 2. 163 файла без наших правок — копируются как есть

Полный список — `donor-report.mjs refs/aecpilot/v2026.9.14`; крупнейшие: `themes/presets.ts`
(+13/−471, переезд в shared), `…/gateway-event/input-requests.ts` (+54/−413 — старый протокол
вопросов снят), `components/ui/connector-card.tsx` и `components/assistant-ui/connector-tool.tsx`
(коннекторы Nous — HX3, лежат мёртвыми), `…/gateway-event/desktop-bridge.ts` (+4/−210),
`app/shell/model-menu-panel.tsx`, `components/assistant-ui/mcp-setup-tool.tsx` (согласие на MCP —
теперь server-request), `components/onboarding-chat/setup-profile.ts` и `store/onboarding-script.ts`
(мёртвые поверхности первого запуска HX26 — остаются в `DEAD_SURFACE_FILES`), `lib/model-options.ts`,
`i18n/en.ts` (+95/−8), `i18n/ru.ts` (+26/−1), `store/mcp-health.ts`, `store/updates.ts` (HX4 — их канал
обновлений не используется). Единственный изменившийся файл `hermes-shared/`: `billing-types.ts`
(+1/−8). `hermes-electron/`: без изменений.

## 3. Источник исчез — 3

Все три переехали из `apps/desktop/src/lib/` в `apps/shared/src/` и импортируются оттуда:
`format.ts`, `model-search-text.ts`, `reconnect-backoff.ts`. Наш код (`aec/**`) их не импортирует;
восемь вендорных импортёров (`app/agents`, `chat/sidebar/*`, `command-center`, `use-gateway-boot`,
`context-usage-panel`, `titlebar-controls`, `skills`) приезжают в списке §1–§2 с новыми путями.
Старые копии в `donor/lib/` удаляются, новые — в `donor/hermes-shared/` третьим корнем
(`runtime/vendor-donor.mjs`).

## 4. Новые файлы донора — решения владельца 2026-09-15

| Семейство | Файлы | Решение |
|---|---|---|
| **Вопросы сервер→клиент** (новый протокол) | `…/gateway-event/server-requests.ts`, `store/server-requests.ts`, `apps/shared/src/json-rpc-channel.ts`, `gateway-contract.generated.ts`, `gateway-contract.openrpc.json`, `gateway-events.ts` | **обязательно** — без них ни один вопрос агента (подтверждение R21, уточнение, секрет, sudo, чтение терминала, предпросмотр R22, согласие MCP, тур) не доедет; наш мост перестраивается (3.B5в) |
| Живой голосовой разговор | `composer/hooks/use-voice-live-conversation.ts`, `composer/start-voice-button.tsx`, `composer/voice-engine-rows.tsx`, `lib/voice-live.ts`, `store/voice-live.ts` | **не берём — HX19 остаётся** (непрерывный разговор исключён 05.09/08.09; сегодняшний ответ «берём» отозван владельцем при переспросе с контекстом). Файлы вендорятся, входы снимаются правкой [3] в `composer/index.tsx`, `controls.tsx`, `voice-menu.tsx`; маршруты `/api/audio/voice-live/*` не зовутся |
| Первый запуск + коннекторы | `components/assistant-ui/first-build-connectors.tsx`, `store/first-build-connectors.ts`, `lib/first-build-start.ts`, `components/onboarding-chat/start.tsx`, `store/tutorial-lifetime.ts`, `store/connector-catalog.ts` | **не берём** (HX26, HX3) — мёртвый код за флагом, который не ставим; `DEAD_SURFACE_FILES` пополняется |
| Глубина рассуждения | `composer/reasoning-pill.tsx`, `shell/reasoning-menu-panel.tsx`, `shell/use-model-menu-controller.ts`, `apps/shared/src/reasoning-effort.ts` | берём (правило объёма) |
| Большая вставка → вложение | `composer/large-paste.ts` (+ их `electron/composer-paste.ts`) | берём; сторона main — наша реализация того же IPC либо честный отказ шима (решается при переносе по правилу «заглушка отказывает честно») |
| Видео в ленте | `components/chat/transcript-video.tsx`, `store/video-playback-speed.ts` | берём — воспроизведение, не генерация (HX11 не задет) |
| Слэш-команды | `lib/desktop-slash-registry.json`, `apps/shared/src/slash.ts` | берём; правки [3]/[5] переезжают на JSON |
| Прочее | `lib/ime.ts`, `lib/tool-result-metadata.ts`, `components/assistant-ui/tool/skill-activity.ts`, `app/starmap/playback-hotkey.ts`, `lib/shared-gateway-restart.ts`, `apps/shared/src/{ansi,color,format,fuzzy,i18n,model-search-text,reconnect-backoff,theme-presets}.ts` | берём как есть |
| Их main-процесс | `electron/ssh-isolated-keepalive.ts` | не вендорится — наш SSH свой (3.13b) |

## 5. Ядро — что известно до установки (полное чтение — `reading-0.21.3.md`)

- Контракт снят с живого реестра дерева 0.21.3 (`contract-snapshot.mjs --core`, формат 4):
  методов 215 (было 225), маршрутов 267, дефолтов 877. **Сломалось 14** — двенадцать методов
  `*.respond` и событие `approval.request` заменены протоколом server-requests, ключ
  `gateway.multiplex_profile_allowlist` снят миграцией 43. **Появилось 18**, **тихо сменилось 16**.
- Наши четыре метода с изменившимся телом (`prompt.submit`, `reload.mcp`, `session.create`,
  `session.delete`) прочитаны построчно — параметры целы, см. reading §2.
- Плагин Mem0: 56 строк диффа, крючки `sync_max_chars`, `user_id`, `search(filters=…)` целы;
  `history_db_path` по-прежнему не пробрасывается — `MEM0_DIR` (D-85) остаётся нашим.
- Зависимость `pillow-heif` — веттинг перед установкой (3.B5е); решение владельца: ставить,
  если веттинг подтвердит, LGPL-библиотеку в колесе допустить и дописать C3.
- Их установщик/обновление (`hermes update`, `gateway migrate --multiplex`) — не наш путь.

## 6. Гейт переноса

Как в 3.B4, плюс новое: `pnpm -C apps/desktop build` (относительные импорты), typecheck,
eslint, prettier, vitest целиком, e2e ≥3 зелёных на одной сборке, pytest + ruff, три реестра по
нулю, `donor-report.mjs refs/aecpilot/v2026.9.14` → «изменившихся 0, исчезнувших 0», все пробы
(пять проб памяти обязательны; падение на приватном имени ядра сверяется с дифом — ловушка 5).
**Новое в гейте:** живая проверка server-requests на настоящем ядре — уточнение, подтверждение
команды (R21), секрет, чтение терминала, чтение/действие в предпросмотре (R22 — пометка
недоверенного текста едет ответом-кадром) — пробой `runtime/server-requests-probe.mjs` (новая),
потому что мок e2e старого протокола вопросов не эмулировал и нового не эмулирует.

## 7. Итог переноса (2026-09-15)

Выполнено в тот же день, коммит `245911d`. `donor-report.mjs refs/aecpilot/v2026.9.14`
после переноса: **1246 файлов зоны, 78 с правками, изменилось 0, исчезло 0**. Отклонения
от плана §4: `savePastedText` — ПРОБРОШЕН (большая вставка как `.txt`-вложение, тот же
каталог, что у картинок из буфера), `skipIntro` — объявлен отсутствующим (HX26); их JSON
(`desktop-slash-registry.json`, `gateway-contract.openrpc.json`) вендорится побайтово с
шапкой в соседнем `<имя>.json.provenance` — шапка внутри JSON ломает файл; их тесты
`apps/shared` идут своим vitest-проектом `donor-shared` под node (они писаны под пакет без
DOM). Гейт §6 пройден целиком, числа — TASKS 3.B5; проба `server-requests-probe.mjs` — 17
проверок, две находки записаны в 3.B5в (набор `desktop_ui` только у `source: "desktop"`;
AGENTS.md корня попадает в промпт сессии с cwd в репозитории).
