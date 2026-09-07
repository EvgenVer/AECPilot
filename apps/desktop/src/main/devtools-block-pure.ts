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
