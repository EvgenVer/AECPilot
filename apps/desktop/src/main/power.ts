// Питание машины: батарея и пробуждение после сна (задача 3.28).
//
// ДВА СОБЫТИЯ, ДВА РАЗНЫХ СМЫСЛА.
//
// БАТАРЕЯ. У донора это не индикатор, а режим экономии: их страховочные опросы
// (те, что ловят пропущенное деградировавшим сокетом) на батарее растягиваются
// вчетверо — `store/power.ts`, `batteryPollInterval`. Живой поток и опросы по
// событию не трогаются. То есть без этого моста ноутбук в фоне тратит заряд на
// проверки, которые ему сейчас не нужны. Заодно снимается необработанное
// отклонение промиса на каждом старте: их `void desktop?.getOnBattery?.()`
// звал непроброшенный член (D-41).
//
// ПРОБУЖДЕНИЕ. Машина уснула на середине прогона — сокет к шлюзу мог остаться
// ОТКРЫТЫМ и мёртвым: `close` по нему не приходит, значит переподключение
// клиента не запускается, а приложение выглядит зависшим. Сердцебиения у
// клиента нет (проверено по `shared/gateway/client.ts`), поэтому единственный
// способ узнать правду — спросить. Сам вопрос задаёт `index.ts`: там и клиент,
// и адрес.

import { powerMonitor } from 'electron'

let onBattery = false

/** Читает состояние питания, не падая там, где его нет (виртуалка, сервер без
 * батареи, урезанная сборка Linux). Неизвестно — значит «от сети»: это
 * умолчание донора и оно же безопасное, лишний опрос дешевле пропущенного. */
function readOnBattery(): boolean {
  try {
    return powerMonitor.isOnBatteryPower()
  } catch {
    return false
  }
}

export function isOnBattery(): boolean {
  return onBattery
}

/**
 * Подписывает главный процесс на питание.
 *
 * `onBatteryChanged` зовётся только на СМЕНЕ состояния — рендерер зеркалит
 * значение, и повторное «то же самое» ему не нужно.
 */
export function installPowerWatch(handlers: {
  onBatteryChanged: (value: boolean) => void
  onResume: () => void
}): void {
  onBattery = readOnBattery()

  const change = (value: boolean): void => {
    if (onBattery === value) return
    onBattery = value
    handlers.onBatteryChanged(value)
  }

  powerMonitor.on('on-battery', () => change(true))
  powerMonitor.on('on-ac', () => change(false))
  powerMonitor.on('resume', () => handlers.onResume())
}
