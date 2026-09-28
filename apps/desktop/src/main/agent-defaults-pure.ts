// Задача 3G.10 (SPEC UR42) — какие инструменты модель видит сразу, а какие
// только через их поиск инструментов.
//
// ПОЧЕМУ ИХ УМОЛЧАНИЕ ПЕРЕПИСАНО СЮДА. Ключ `tools.tool_search.defer` задаёт
// список ЦЕЛИКОМ: «an explicit list replaces it wholesale»
// (`hermes_cli/config_defaults.py`). Запиши мы только свои имена — их 17
// спрятанных инструментов окна и служебных вернулись бы в каждый запрос. Тест
// рядом сверяет эту копию с исходником установленного ядра.
//
// Что остаётся видимым (UR42): файлы, терминал, `execute_code`, веб, зрение,
// память, `delegate_task`, `skill_manage` — их в списке нет.

/** Их умолчание (`config_defaults.py`, `tools.tool_search.defer`) — как есть. */
export const CORE_DEFERRED_TOOLS = [
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
  'kanban_show',
  'kanban_unblock'
] as const

/** Сейф паролей браузера (HX24) «едет с браузером» и конфигом не снимается;
 * здесь он уходит из запроса, а вызов отклоняет наш плагин `aec_secret_filter`. */
export const BROWSER_VAULT_TOOLS = [
  'browser_vault_enter_code',
  'browser_vault_fill',
  'browser_vault_list',
  'browser_vault_save_login',
  'browser_vault_unlock'
] as const

export const DEFERRED_TOOLS: readonly string[] = [
  ...CORE_DEFERRED_TOOLS,
  ...KANBAN_TOOLS,
  'browser_exec',
  ...BROWSER_VAULT_TOOLS
]

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
