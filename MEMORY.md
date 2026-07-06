# MEMORY — stable cross-session context
<!-- Only durable, low-frequency facts. Do NOT store: secrets, task progress, long logs,
     or duplication of the triad. If a fact becomes part of the current task → move to TASKS/NOTES. -->
<!-- Entry format: one bullet per fact, stamped —
     `<fact>  ·  source: <where>  ·  date: <YYYY-MM-DD>  ·  confidence: high/med/low`. -->

## User preferences
- Общение и проектные документы — на русском; toolkit/код — английский · source: сессии 05–06.07 · date: 2026-07-06 · confidence: high
- TASKS обязан быть атомарным по всем фазам до старта кода; спеки писать заранее, а не декомпозировать по допущениям · source: правка владельца · date: 2026-07-06 · confidence: high
- Вопросы владельцу задавать пакетами с вариантами ответов · source: сессии grill · date: 2026-07-06 · confidence: med

## Environment quirks
- Windows 11; до задачи 0.2 git сыпал LF→CRLF-варнингами (косметика; лечится .gitattributes) · source: observed · date: 2026-07-06 · confidence: high
- Ответ «Other» в вопросах с вариантами может прийти без текста (случай docgen/O5) — при пустом «другое» переспрашивать · source: observed · date: 2026-07-06 · confidence: med

## Durable project facts
- Планировочный комплект (DESCRIPTION, SPECIFICATION, 6 specs, PLAN, TASKS-92) утверждён владельцем · source: сообщение владельца · date: 2026-07-06 · confidence: high
- Ядро hermes-agent не форкается; интеграция только через tui_gateway JSON-RPC/WS; AEC-слой = собственные skills + MCP · source: SPECIFICATION C1–C2 · date: 2026-07-06 · confidence: high
- Лицензии зависимостей: только MIT/Apache/BSD; AGPL/GPL запрещены · source: SPECIFICATION C3 · date: 2026-07-06 · confidence: high
- MVP на облачных LLM и эмбеддингах; переход в закрытый контур = полный re-ingest индексов (принято владельцем) · source: SPECIFICATION C5 · date: 2026-07-06 · confidence: high
- docgen в MVP — только пояснительная записка; новые типы документов = новые шаблоны (O5 закрыт) · source: ответ владельца · date: 2026-07-06 · confidence: high
