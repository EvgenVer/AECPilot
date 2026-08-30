# Постоянный чат: переезд на схему ядра 0.20.6 (задача 3.B2а)

Замер 2026-08-30, до подъёма пина. Читается дерево `v2026.8.27` (= 0.20.6,
коммит `5fc308a7`) против нашего пина `fcbd1076` (= 0.20.5).

Задача отвечает на один вопрос: **во что превращается наш постоянный чат, когда
ядро сняло механизм, на котором он стоит.** Ответы даны строкой их кода, а не
пересказом — размер задачи 3.B2б выводится отсюда.

---

## 1. Что снято и куда переехало

| Снято в 0.20.6 | Где было | Приёмник | Строка их кода |
|---|---|---|---|
| параметр `profiles.list.preferred_session_ids` | `methods_profiles.py:212` (0.20.5) | **ничего** — клиентский указатель отменён как класс | `methods_profiles.py:282` — `row["canonical_session"] = _canonical_session_row(db, p.path)`, вызывается БЕЗ параметров от клиента |
| поле ответа `preferred_session` | `methods_profiles.py:236` (0.20.5) | `canonical_session` | там же |
| функция `_preferred_session_row(profile_path, session_id)` | `methods_profiles.py:63` (0.20.5) | `_canonical_session_row(db, profile_path)` | `methods_profiles.py:85` — сигнатура сменилась: **id больше не принимается** |

Их собственная формулировка причины, `methods_profiles.py:280`:
«The profile's canonical "Bot Chat" registry row (or None) — identity is the
NAME, resolved server-side on every listing so **no client ever needs to carry a
session pointer**».

И то же решение у них на клиенте, `plugins/hermes-bots/plugin.js:5638`:
«Stored-id pins (`ui_meta['hermes-bots'].chat`) were the previous identity and
are **REMOVED**: every lost-chat incident traced to a dangled or stolen pointer
that later guards then welded in.» Дорога, которую мы прошли своим путём, у них
закончилась тем же выводом.

**Наш код, который это ломает** (молча, без ошибки):

| Файл | Строка | Что делает | Что будет на 0.20.6 |
|---|---|---|---|
| `main/roster.ts` | 411 | шлёт `preferred_session_ids: { [name]: pin }` | параметр не читается никем — тихо игнорируется |
| `main/roster.ts` | 418 | читает `row?.preferred_session` | поля нет → `undefined` |
| `main/canonical-chat-pure.ts` | 83 | `if (!facts.answered \|\| facts.preferred === undefined) return { action: 'open', sessionId: facts.pin }` | ветка «ядро не отвечало» срабатывает ВСЕГДА |
| `shared/gateway/types.ts` | 318 | объявляет `preferred_session_ids?` | тип описывает несуществующий параметр |
| `main/roster.test.ts` | 390, 403, 429, 532 | мокает ответ с `preferred_session` | **тесты остаются зелёными на сломанном коде** |

Последняя строка и есть причина, по которой 3.B2б стоит отдельной задачей:
поломка не даёт ни исключения, ни красного теста. Она даёт открытие чата по
`facts.pin` — то есть по нашему сохранённому указателю, без подтверждения ядром,
ровно в том режиме, который их инцидент-лист называет источником потерянных чатов.

---

## 2. `_canonical_session_row` — что проверяет и когда отдаёт `None`

`methods_profiles.py:85–152`. Порядок проверок:

1. `db is None` → `None` (профиль без БД сессий).
2. `row = db.get_session_by_title("Bot Chat")` — **литерал в этом файле**, не
   импорт константы. Пусто → `None`.
3. `row["id"]` пустой → `None`.
4. `row["source"]` ∈ `{"kanban", "tool"}` → `None`. Деньлист внутренних
   источников. **Наш `aecpilot-roster` в него не входит** — проверено списком.
5. `row["archived"]` → пробует воскресить через `_resurrect_recoverable_canonical`;
   не вышло → `None`.
6. Иначе отдаёт словарь: `id` (**реестровая строка = идентичность**),
   `resolved_id` (**живая вершина сжатой линии = что открывать**), `root_title`,
   `title`, `preview`, `started_at`, `last_active`, `message_count`.
7. Любое исключение → `None`. Их формулировка: «Best-effort: any failure degrades
   to None rather than failing the whole profiles.list call».

**Следствие для нас, важное.** Пункт 7 означает: `canonical_session: null` — это
НЕ доказательство отсутствия чата. Это может быть и сбой. Их клиент из этого
делает жёсткий вывод, `plugin.js:5747`: «FAIL CLOSED. A failed registry lookup
MUST NOT read as "no Bot Chat exists" — that is the one remaining way to fork a
bot's forever chat», и при ошибке поиска бросает исключение вместо создания.
Наш `planCanonicalChat` обязан получить то же правило: **отсутствие ответа ≠
отсутствие чата, и создавать в этом случае нельзя.**

---

## 3. Два разных вызова — не путать

Их клиент спрашивает ядро о каноническом чате **двумя разными способами**, и это
не дублирование:

| Зачем | Вызов | Где у них |
|---|---|---|
| нарисовать строку роестра (превью, куда ведёт клик) | `profiles.list` → `canonical_session` | `plugin.js:4690`, чтение — `:8846` |
| **открыть чат** — точный реестровый поиск | `session.list` с `title: "Bot Chat"`, `include_hidden: true`, `limit: 200` | `plugin.js:5760` — `findExistingCanonicalChat` |

Второй — индексированный `WHERE title = ?`, без окна выдачи: «a busy profile can
push the forever-chat past any recency window». Первый едет вместе со списком
профилей и лишнего запроса не стоит.

Признак «это реестровая строка», `plugin.js:5708` — `isCanonicalBotChatHistory`:
`root_title === "Bot Chat"`, а если `root_title` пуст — то `title === "Bot Chat"`.
Два поля потому, что точный поиск отдаёт корень линии, а оконная выдача — вершину.

---

## 4. Создание: три шага, порядок обязателен

`plugin.js:5802–5895` (`createCanonicalChat`). Наивная последовательность здесь неверна, и они это
записали.

**Шаг 1** (`plugin.js:5843`). `session.create` с `{ profile, title: "Bot Chat", hidden: true }`.
Ядро принимает оба параметра — `methods_session.py:100–101`, они кладутся в
`pending_title` / `pending_hidden`.

**Шаг 2, без которого механизм не работает.** `session.create` **ленивый**:
строки в БД нет до первого промпта. Пока строка не названа, реестр не содержит
записи «Bot Chat» — и второй клик в это окно создаёт дубликат, а автоименователь
хода может выиграть гонку у отложенного заголовка. Поэтому сразу же
`session.title { session_id: <runtime id>, title: "Bot Chat" }` — материализует
строку немедленно и записывает заголовок с авторитетом `user`. Их комментарий:
«until the row is titled, the registry has no "Bot Chat" entry, so a second click
during the intro turn mints a duplicate».

**Шаг 3** (`plugin.js:5880`). Если `session.title` отвечает ошибкой, содержащей `already in use` —
это **не** старый шлюз, а другой писатель занял канонический заголовок между
нашим промахом по реестру и этой записью. Их правило — **ADOPT-BEFORE-MINT**:
перечитать реестр, принять победителя, свою пустую ленивую сессию бросить (шлюз
её подметёт). Текст ошибки ядра, `hermes_state.py:9290`:
`Title '<...>' is already in use by session <id>`.

**Наш текущий create** (`roster.ts:452`) шлёт `{ source, hidden: true, profile }`
и берёт `session_id`. К нему добавляется `title`, немедленный `session.title` по
**runtime**-идентификатору и разбор `already in use`. Поле `source` остаётся —
оно не мешает (п. 4 раздела 2) и полезно в отладке, но **идентичностью больше не
является**: искать по нему нельзя, иначе мы держим два механизма опознания сразу.

---

## 5. Защита заголовка — при каких условиях она работает

`hermes_state.py:9236–9256` («Hidden is the discriminator» — `:9243`). Отказ в переименовании срабатывает при **всех
четырёх** условиях одновременно:

1. запись идёт с авторитетом `user` (`is_user`);
2. текущий заголовок ровно `"Bot Chat"`;
3. **строка скрытая** (`hidden`);
4. новый заголовок отличается от `"Bot Chat"`.

Третье условие — дискриминатор, и он для нас обязателен. Их комментарий: «Hidden
is the discriminator: canonical chats are born hidden; an ordinary visible
session a user happens to call "Bot Chat" stays freely renameable». **Видимый чат
с тем же заголовком не защищён вовсе.** Наш чат создаётся скрытым уже сейчас
(`roster.ts:454`), так что условие выполняется — но теперь оно не косметика, а
несущее: перестанем создавать скрытым — потеряем защиту.

Автоименователь модели отсекается отдельной веткой, `hermes_state.py:9256`:
запись не от пользователя не перебивает заголовок, чей ранг не ниже
(`user` = 2 > `llm` = 1). Плюс `agent/title_generator.py:596` пропускает сессию,
чей `title_source` не `derived`. Файл `title_generator.py` между 0.20.5 и 0.20.6
**не менялся вовсе** — защита целиком в слое БД.

**Проверено: в 0.20.5 этой защиты нет.** `grep` по `hermes_state.py` на нашем
пине не находит ни `CANONICAL_BOT_CHAT_TITLE`, ни отказа. Система авторитетов
(`TITLE_SOURCE_USER`) там уже была, а отказ появился только сейчас. Значит
решение 3C.4б было верным для своего ядра и перестало быть верным для этого.

---

## 6. Три их заплатки — работают ли на НАШ чат

Вопрос не праздный: заплатки писались под их плагин. Разбор по условиям
срабатывания, а не по намерению.

| Заплатка | Условие срабатывания | На наш чат |
|---|---|---|
| **#92687** воскрешение случайно заархивированного | `title_lookup == BOT_CHAT_TITLE` (`methods_session.py:198`) и `_canonical_session_row` (`methods_profiles.py:125`). Восстановимыми считаются только `ws_orphan_reap` и `agent_close`; архив без причины или с явной (`session_reset`, ручной) не трогается — `hermes_state.py:9484` | **работает**, как только заголовок наш. От источника и создателя не зависит |
| **#93296** усыновление застрявшей сессии | `session.resume` при профильном запросе (`owns_db`), точное совпадение **id** в дефолтном хранилище; заголовок не участвует — `methods_session.py:521` | **работает**, от заголовка не зависит вовсе |
| **lazy-resume** вместо 404 | `session.resume` ищет живую неперсистированную сессию по `session_key` или `pending_title` в пределах того же `profile_home` — `methods_session.py:452` | **работает**; ветка `pending_title` дополнительно попадает в цель, когда мы шлём `title` при создании |

Итого: все три достаются даром, и ни одна не требует, чтобы чат создавал их
плагин. Единственное условие у первой — заголовок; у двух остальных нет и его.

---

## 7. Размер задачи 3.B2б

Выводится из разделов выше.

**Уходит:**
- хранение и передача указателя: `preferred_session_ids`, `preferred_session`,
  чтение `chatSessionId` как пина, `rememberChat` в роли «запомнить
  идентичность» (остаётся ли она вообще — решается кодом, см. ниже);
- поиск по источнику `findOurChat` в нынешнем виде (перебор списка с фильтром по
  `source`);
- ветки `planCanonicalChat`, работающие с `pin` и `preferred` — это 4 из 6 ветвей
  функции (`canonical-chat-pure.ts:79–93`);
- объявление `preferred_session_ids` в `shared/gateway/types.ts`.

**Приходит:**
- `findExistingCanonicalChat` — `session.list` с `title`, `include_hidden: true`,
  **fail closed**: ошибка бросается наверх, а не читается как «чата нет»;
- чтение `canonical_session` из `profiles.list` для строки роестра, с честным
  различением `id` (идентичность) и `resolved_id` (что открывать);
- создание в три шага: `session.create` с `title` + `hidden`, немедленный
  `session.title`, разбор `already in use` через adopt-before-mint;
- защита от двойного клика (их `canonicalCreations` — карта незавершённых
  созданий по имени специалиста);
- тест, который бьётся о **настоящий** ответ шлюза, а не о мок: нынешняя поломка
  молчалива именно потому, что мок содержит поле, которого в ядре больше нет.

**Не трогается:** подмена `/new` очисткой контекста
(`canonical-chat-pure.ts:104+`) — она про композер и от механизма опознания не
зависит.

**Оценка:** `canonical-chat-pure.ts` сжимается (уходят 4 ветви, приходит правило
fail-closed), `roster.ts` — переписываются три функции (`openCanonicalChat`,
`findOurChat`, создание), `roster.test.ts` — переписываются 4 набора моков.
Порядок работ: сначала чистая функция и её тесты, потом вызовы. Миграции нет
(решение владельца 2026-08-30) — старые чаты в dev-профиле заводятся заново.
