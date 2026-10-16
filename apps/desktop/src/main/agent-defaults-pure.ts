// Задача 3G.10 (SPEC UR42) — какие инструменты модель видит сразу, а какие
// только через их поиск инструментов.
//
// ПОЧЕМУ ИХ УМОЛЧАНИЕ ПЕРЕПИСАНО СЮДА. Ключ `tools.tool_search.defer` задаёт
// список ЦЕЛИКОМ: «an explicit list replaces it wholesale»
// (`hermes_cli/config_defaults.py`). Запиши мы только свои имена — их 19
// спрятанных инструментов окна и служебных вернулись бы в каждый запрос. Тест
// рядом сверяет эту копию с исходником установленного ядра.
//
// Что остаётся видимым (UR42): файлы, терминал, `execute_code`, веб, зрение,
// память, `delegate_task`, `skill_manage` — их в списке нет.

/** Их умолчание (`config_defaults.py`, `tools.tool_search.defer`) — как есть.
 * С ядра 0.22.0 в нём сам `browser_vault` (сейф стал одним инструментом), а также
 * `manage_catalog` и `set_theme`; `apply_layout` снят (задача T20.5). */
export const CORE_DEFERRED_TOOLS = [
  'computer_use',
  'session_search',
  'image_generate',
  'todo_list',
  'process_manage',
  'cronjob_manage',
  'browser_vault',
  'drive_preview',
  'gui_tour',
  'desktop_preview',
  'annotate_preview',
  'manage_catalog',
  'show_tip',
  'desktop_project',
  'close_terminal',
  'set_theme',
  'read_terminal',
  'read_window_below',
  'focus_pane'
] as const

/** Доска задач (UR38) — доступна, подгружается по нужде (UR42). */
export const KANBAN_TOOLS = [
  'kanban_attach',
  'kanban_attach_url',
  'kanban_attachments',
  'kanban_block',
  'kanban_comment',
  'kanban_complete',
  'kanban_create',
  'kanban_heartbeat',
  'kanban_link',
  'kanban_list',
  'kanban_request_changes',
  'kanban_request_review',
  // С ядра 0.22.0 — отложенный запуск задачи доски (T20.5).
  'kanban_schedule',
  'kanban_show',
  'kanban_unblock'
] as const

/** Сейф паролей браузера (HX24) «едет с браузером» и конфигом не снимается.
 * До ядра 0.22.0 это было пять инструментов — их мы прятали сами; с 0.22.0 один
 * `browser_vault` уже в их умолчании. Вызов любого из них отклоняет наш плагин
 * `aec_secret_filter`. */
export const DEFERRED_TOOLS: readonly string[] = [
  ...CORE_DEFERRED_TOOLS,
  ...KANBAN_TOOLS,
  'browser_exec'
]

/** Наш список, записанный в профили при ядре 0.21.5 (задача 3G.10). Профиль, где
 * он стоит в точности, получает новый (`upgradeNestedList`); список, который
 * человек поменял, не трогается. Без замены профиль 0.22 видел бы `apply_layout`
 * отложенным, а новый `browser_vault`, `manage_catalog`, `set_theme` — в каждом
 * запросе. */
export const PREVIOUS_DEFERRED_TOOLS: readonly (readonly string[])[] = [
  [
    'computer_use',
    'session_search',
    'image_generate',
    'todo_list',
    'process_manage',
    'cronjob_manage',
    'drive_preview',
    'gui_tour',
    'desktop_preview',
    'annotate_preview',
    'show_tip',
    'desktop_project',
    'close_terminal',
    'apply_layout',
    'read_terminal',
    'read_window_below',
    'focus_pane',
    'kanban_attach',
    'kanban_attach_url',
    'kanban_attachments',
    'kanban_block',
    'kanban_comment',
    'kanban_complete',
    'kanban_create',
    'kanban_heartbeat',
    'kanban_link',
    'kanban_list',
    'kanban_request_changes',
    'kanban_request_review',
    'kanban_show',
    'kanban_unblock',
    'browser_exec',
    'browser_vault_enter_code',
    'browser_vault_fill',
    'browser_vault_list',
    'browser_vault_save_login',
    'browser_vault_unlock'
  ]
]

/** Задача T20.5 (решение владельца 2026-10-15, интервью вопрос 5; SPEC HX3, HX31,
 * UR23, R10). Умолчания ядра 0.22, которые закрываются в профиле — умолчанием:
 * ключ пишется, только когда его нет. Путь — два или три уровня YAML. */
export interface CoreOptOut {
  path: readonly [string, string] | readonly [string, string, string]
  value: boolean | number
  what: string
}

export const CORE_OPT_OUTS: readonly CoreOptOut[] = [
  // Ленивая доустановка Python-пакетов ядром в момент вызова — мимо нашего
  // веттинга; каталог плагинов ставит пакеты только через наше окно (UR23).
  { path: ['security', 'allow_lazy_installs'], value: false, what: 'the lazy-install opt-out' },
  // Вход чужими учётными записями, найденными на машине (их CLI-логины) — HX3.
  {
    path: ['auth', 'adopt_external_logins'],
    value: false,
    what: 'the external-login adoption opt-out'
  },
  // Размещённые коннекторы Nous — HX3; MCP-серверы во вкладке остаются.
  { path: ['tools', 'connectors', 'enabled'], value: false, what: 'the Nous connectors opt-out' },
  // Общая телеметрия для Nous — HX31. У ядра уже `false`; закреплено, чтобы смена
  // их умолчания не включила её молча (урок `vault.*.enabled`, 3.B6г).
  {
    path: ['telemetry', 'shared_metrics', 'enabled'],
    value: false,
    what: 'the shared-metrics opt-out'
  },
  {
    path: ['telemetry', 'shared_metrics', 'send'],
    value: false,
    what: 'the shared-metrics send opt-out'
  },
  // Проверка обновлений плагинов раз в сутки (фид, git ls-remote, PyPI) шлюзом
  // расписаний — тот же класс, что `updates.check` (R10, HX4); `0` выключает.
  {
    path: ['plugins', 'auto_update_check_hours'],
    value: 0,
    what: 'the plugin update-check opt-out'
  },
  // Предел ядра 0.22 на импорт + `register()` плагина — 10 с, и не уложившийся
  // плагин МОЛЧА пропускается. Наш фильтр секретов в `register()` ставит ключ
  // Mem0 по имени, а импорт их бэкенда Mem0 занимает ~12,7 с (замер T20.9): с
  // пределом по умолчанию первая загрузка фильтра в процессе ядра срывается, и
  // ход идёт без проверки секретов. 120 с — запас, а не «без предела» (`0`):
  // зависший чужой плагин не должен держать старт ядра вечно.
  {
    path: ['plugins', 'load_timeout_seconds'],
    value: 120,
    what: 'the plugin load deadline our secret filter needs'
  }
]

/** UR5 (решение владельца 2026-10-15, интервью вопрос 12): навык ответа по
 * источникам закреплён загруженным в каждой новой сессии (`skills.auto_load`,
 * ядро 0.22.0), а не только подсказкой SOUL. */
export const AUTO_LOAD_SKILLS: readonly string[] = ['aec-qa']

/** Задача 3G.11 (SPEC UR42, список владельца 2026-09-28). Навыки ядра не про
 * проектирование — выключены УМОЛЧАНИЕМ (`skills.disabled`), включаются обратно в
 * «Возможностях». Оставлены: `hermes-agent` (ядро его не выключает, `ESSENTIAL_SKILLS`),
 * `docx`, `xlsx`, `pdf`, `ocr-and-documents`, `powerpoint`, `document-to-action-items`,
 * `meeting-action-items`, `grounded-citations`, `excalidraw`, `maps`, `computer-use`,
 * `sources-management` и наши (`aec-qa`, `aec-wiki`). Список — их комплект 0.21.5 и
 * имена прежних комплектов, которые остаются в профилях, заведённых раньше; `llm-wiki`
 * выключен — его место занимает наш `aec-wiki` (3G.14). */
export const DISABLED_SKILLS: readonly string[] = [
  'airtable',
  'apple-notes',
  'apple-reminders',
  'architecture-diagram',
  'arxiv',
  'ascii-art',
  'ascii-video',
  'baoyu-infographic',
  'blocked-page-recovery',
  'blogwatcher',
  'box',
  'claude-code',
  'claude-design',
  'codebase-inspection',
  'codex',
  'comfyui',
  'competitor-news-monitor',
  'design-md',
  'dogfood',
  'email-inbox-triage',
  'evaluating-llms-harness',
  'findmy',
  'gif-search',
  'github',
  'github-auth',
  'github-code-review',
  'github-issue-to-pr',
  'github-issues',
  'github-pr-workflow',
  'github-repo-management',
  'google-workspace',
  'hermes-agent-skill-authoring',
  'himalaya',
  'huggingface-hub',
  'humanizer',
  'imessage',
  'inspecting-hermes-desktop-dom',
  'llama-cpp',
  'llm-wiki',
  'manim-video',
  'merge-reconciler',
  'nano-pdf',
  'node-inspect-debugger',
  'notion',
  'obsidian',
  'opencode',
  'openhue',
  'p5js',
  'plan',
  'polymarket',
  'popular-web-designs',
  'pretext',
  'product-price-monitor',
  'python-debugpy',
  'requesting-code-review',
  'research-paper-writing',
  'sdlc-review',
  'serving-llms-vllm',
  'session-librarian',
  'simplify-code',
  'sketch',
  'songsee',
  'songwriting-and-ai-music',
  'spike',
  'systematic-debugging',
  'teams-meeting-pipeline',
  'test-driven-development',
  'touchdesigner-mcp',
  'weekly-review-planning',
  'weights-and-biases',
  'xurl',
  'youtube-content'
]

/** D-165 (решение владельца 2026-09-30). Команды, которые ядро не даст выполнить
 * агенту НИКОГДА — даже при yolo и `approvals.mode: off` (`approvals.deny`,
 * `tools/approval_floors.py::_match_user_deny_rule`: маски fnmatch без учёта регистра
 * по имени исполняемого файла и по всей строке). 30.09.2026 агент поставил MCP-сервер
 * через CLI ядра (`printf 'y' | hermes mcp add …`) мимо карточки согласия. Короткий
 * `hermes` из PATH — наша обёртка, она пропускает только `chat` (runtime/bin/
 * hermes_gate.py); здесь закрыты обходы мимо неё: `hermes.exe` любым путём (наш venv
 * или отдельная установка) и `python -m hermes_cli`. Проверено их же сопоставителем на
 * шести обходах и пяти обычных командах, включая команду рутины `hermes -p … chat`.
 * Значения — готовый YAML (кавычки нужны из-за `*` и `"`). */
export const APPROVAL_DENY: readonly string[] = [
  'hermes.exe',
  "'*hermes.exe *'",
  `'*hermes.exe" *'`,
  "'*-m hermes_cli*'"
]
