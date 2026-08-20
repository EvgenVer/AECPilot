// Хранение общего переключателя непрерывности и его применение к уже
// заведённым задачам (задача 3.5а). Решения — в `continuity-pure.ts`.

import { Codecs, persistentAtom } from '../../donor/lib/persisted'
import { getCronJobs, updateCronJob } from '../../donor/hermes'
import { invalidateCronJobsRequests } from '../../donor/store/cron'

import { continuityUpdateFor } from './continuity-pure'

const STORAGE_KEY = 'aec.cron.continuity'

/** Включена по умолчанию: см. основание в шапке `continuity-pure.ts`. */
export const $cronContinuity = persistentAtom<boolean>(STORAGE_KEY, true, Codecs.bool)

export function cronContinuityEnabled(): boolean {
  return $cronContinuity.get()
}

/** Переключает тумблер и проходится по уже заведённым задачам.
 *
 * Проход обязателен: без него включение действовало бы только на задачи,
 * созданные ПОСЛЕ, и человек, включивший непрерывность, получил бы её не там,
 * где ожидал. Ошибка на отдельной задаче не роняет остальные — тумблер уже
 * переключён, и повторное переключение доведёт отставших. */
export async function setCronContinuity(
  enabled: boolean
): Promise<{ changed: number; failed: number }> {
  $cronContinuity.set(enabled)

  let changed = 0
  let failed = 0

  let jobs: Awaited<ReturnType<typeof getCronJobs>> = []
  try {
    jobs = await getCronJobs()
  } catch {
    // Шлюз недоступен — тумблер всё равно переключён, и новые задачи поедут
    // правильно. Старые догонит следующее переключение.
    return { changed, failed: 1 }
  }

  for (const job of jobs) {
    const update = continuityUpdateFor(job as { context_from?: unknown }, enabled)
    if (!update) continue

    try {
      await updateCronJob(job.id, update as never)
      changed += 1
    } catch {
      failed += 1
    }
  }

  if (changed > 0) invalidateCronJobsRequests()

  return { changed, failed }
}
