// Кто запускает задачи по расписанию — зеркало состояния из главного процесса
// (задача 3.6а).
//
// Состояние живёт в main: там процесс, там сохранённый выбор, и там же он
// узнаёт о неожиданном выходе. Окно его отражает — и подписывается, чтобы
// «выключилось само» не осталось незамеченным.

import { atom } from 'nanostores'

export interface CronRunnerState {
  enabled: boolean
  running: boolean
}

export const $cronRunner = atom<CronRunnerState>({ enabled: false, running: false })

let started = false

/** Читает состояние и подписывается на его смену. Зовётся один раз из
 * `register.tsx`; повторный вызов ничего не делает. */
export function watchCronRunner(): void {
  if (started) return
  started = true

  void window.aecpilot.getCronRunner().then((state) => $cronRunner.set(state))
  window.aecpilot.onCronRunnerChanged((state) => $cronRunner.set(state))
}

export async function setCronRunner(on: boolean): Promise<CronRunnerState> {
  const state = await window.aecpilot.setCronRunner(on)
  $cronRunner.set(state)
  return state
}
