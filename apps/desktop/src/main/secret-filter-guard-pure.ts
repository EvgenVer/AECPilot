// Задача T20.10 (решение владельца 2026-10-16, п. 17). Сторож загрузки фильтра
// секретов.
//
// ПОЧЕМУ. Ядро 0.22 молча выбрасывает плагин, чей импорт и `register()` не
// уложились в `plugins.load_timeout_seconds`, вместе со всем, что он успел
// зарегистрировать (`hermes_cli/plugins_loader.py::run_with_load_deadline`), — и
// об этом знает только `errors.log`. Профиль держит 120 с при замеренных ~13 с
// (`CORE_OPT_OUTS`), но медленный диск или проверка антивирусом этот запас съедят,
// и ход пойдёт без проверки секретов.
//
// КАК. Последняя регистрация фильтра — команда `aec-filter-status`
// (`plugins/aec_secret_filter/__init__.py`): она есть у ядра, только если загрузка
// дошла до конца в срок. Перед первым ходом каждой сессии главный процесс спрашивает
// её через `command.dispatch`; нет ответа — ход не отправляется.

import { mainT } from './i18n'

export const FILTER_STATUS_COMMAND = 'aec-filter-status'
export const FILTER_STATUS_LOADED = 'aec-secret-filter: loaded'

export function filterNotLoaded(): string {
  return mainT('secretFilter.notLoaded')
}

/** Запросы, с которых начинается работа модели с инструментами. */
const TURN_METHODS = new Set(['prompt.submit', 'prompt.background', 'prompt.btw'])

/** Нужна ли проверка фильтра перед этим запросом. `command.dispatch` запускает
 *  ходы (`/goal`, `/learn`), но наша команда состояния — сама проверка. */
export function startsTurn(method: string, params: unknown): boolean {
  if (TURN_METHODS.has(method)) return true
  if (method !== 'command.dispatch') return false
  const name = (params as { name?: unknown } | null)?.name
  return name !== FILTER_STATUS_COMMAND
}

/** Сессия запроса, если он её называет. */
export function turnSessionId(params: unknown): string | null {
  const id = (params as { session_id?: unknown } | null)?.session_id
  return typeof id === 'string' && id !== '' ? id : null
}

/** Ответ `command.dispatch` на команду состояния: загружен ли фильтр. */
export function filterLoaded(result: unknown): boolean {
  const output = (result as { output?: unknown } | null)?.output
  return typeof output === 'string' && output.trim() === FILTER_STATUS_LOADED
}
