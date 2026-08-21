// Видно ли, что задачи по расписанию кто-то запускает (задача 3.6а).
//
// Показывается ТОЛЬКО когда человек их включил. Кто расписаниями не
// пользуется, не должен видеть в строке состояния строку про то, чем не
// пользуется; а кто включил — обязан видеть, работает ли оно, потому что
// «включено» и «поднялось» это разные вещи: процесс мог не стартовать или
// упасть, и тогда задачи молча не идут.

import { useStore } from '@nanostores/react'

import { useAecT } from '../../shared/i18n'

import { $cronRunner, setCronRunner } from './store'

export function CronRunnerBadge(): React.JSX.Element | null {
  const state = useStore($cronRunner)
  const t = useAecT()

  if (!state.enabled) return null

  const label = state.running ? t('cron.runner.on') : t('cron.runner.broken')

  return (
    <button
      className={
        state.running
          ? 'text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)'
          : 'text-xs text-(--ui-text-danger)'
      }
      onClick={() => void setCronRunner(false)}
      title={t('cron.runner.turnOff')}
      type="button"
    >
      {label}
    </button>
  )
}
