// Запрет F12 — правила без Electron (задача 3E.11, UR35).
//
// ЗАЧЕМ ТАКАЯ НАСТРОЙКА ВООБЩЕ. Инструменты разработчика открываются одной
// клавишей, и человек, работающий с чертежами, попадает в них случайно: окно
// внезапно делится пополам, показывая консоль. Выключатель это чинит, а
// включён он или нет — решает человек, поэтому умолчание «не блокировать».
//
// БЛОКИРУЕТСЯ ТОЛЬКО F12, а не любой способ открыть инструменты. Настройка
// называется «запретить F12», и расширять её молча на Ctrl+Shift+I значило бы
// сделать не то, о чём человека спросили: тот, кто нажимает сочетание из трёх
// клавиш, попадает туда намеренно.

export interface KeyPress {
  key: string
  control?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
}

/** Гасить ли это нажатие. */
export function shouldBlockDevtoolsKey(input: KeyPress, blocked: boolean): boolean {
  if (!blocked) return false
  // Ровно F12 и ровно без модификаторов: Shift+F12 у Chromium другая команда,
  // и запрет на неё был бы запретом, о котором не просили.
  return input.key === 'F12' && !input.control && !input.meta && !input.shift && !input.alt
}

/** Задача 3G.23 (D-146): F12 как назначаемая клавиша — их `f12-shortcut`.
 * Когда у окна есть привязка на F12 (или окно ловит новое сочетание), нажатие
 * уходит окну раньше Chromium, и запрет F12 его тогда не касается: человек сам
 * отдал клавишу команде. */
export function shouldForwardF12(
  input: KeyPress & { type?: string },
  shortcutActive: boolean
): boolean {
  return shortcutActive && input.type === 'keyDown' && input.key === 'F12'
}

/** Нажатие в той форме, которую ждёт их `onF12Shortcut`. */
export function f12Payload(
  input: KeyPress & { code?: string; isAutoRepeat?: boolean }
): Record<string, unknown> {
  return {
    alt: Boolean(input.alt),
    code: input.code,
    control: Boolean(input.control),
    key: input.key,
    meta: Boolean(input.meta),
    repeat: Boolean(input.isAutoRepeat),
    shift: Boolean(input.shift)
  }
}

/** Настройка с диска. Любая поломка файла — это «не блокировать»: запрет,
 * взявшийся из испорченного JSON, человек не сможет объяснить. */
export function parseDevtoolsBlocked(text: string): boolean {
  try {
    return (JSON.parse(text) as { on?: unknown }).on === true
  } catch {
    return false
  }
}

export function serializeDevtoolsBlocked(on: boolean): string {
  return JSON.stringify({ on }, null, 2) + '\n'
}
