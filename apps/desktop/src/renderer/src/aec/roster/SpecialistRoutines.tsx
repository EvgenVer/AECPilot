// Рутины специалиста (задача 3C.5, SPEC UR27).
//
// Рутина принадлежит тому, кто её выполняет: «Смета каждую пятницу пересчитывает
// объёмы». Поэтому она и живёт в карточке специалиста, а не в общем списке
// расписаний — общий список отвечает на вопрос «что вообще запланировано», а
// этот на «чем занят он».
//
// ПУСТОЙ СПИСОК ОБЪЯСНЯЕТСЯ. «Рутин нет» и «рутины есть, но не у него» — разные
// вещи: первое приглашает завести, второе предупреждает, что вторая такая же
// уже где-то стоит (их урок `routines-filter-hint`).

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import { useAecT } from '../../shared/i18n'

export function SpecialistRoutines({ profile }: { profile: string }): React.JSX.Element {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', prompt: '', schedule: '' })
  const [error, setError] = useState<string | undefined>(undefined)

  const key = ['aec', 'roster', 'routines', profile]

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => window.aecpilot.listRoutines(profile),
    // Неудачное обновление оставляет последний хороший список, а не пустой:
    // пустой читается как «рутин нет» и подталкивает завести вторую такую же.
    placeholderData: (previous) => previous
  })

  const reload = (): Promise<void> => queryClient.invalidateQueries({ queryKey: key }).then()

  const report = (result: { ok: boolean; error?: string }): boolean => {
    setError(result.ok ? undefined : (result.error ?? t('roster.routineFailed')))
    return result.ok
  }

  const create = useMutation({
    mutationFn: () => window.aecpilot.createRoutine({ profile, ...draft }),
    onSuccess: async (result) => {
      if (report(result)) {
        setAdding(false)
        setDraft({ name: '', prompt: '', schedule: '' })
      }
      await reload()
    }
  })

  const toggle = useMutation({
    mutationFn: (row: { id: string; enabled: boolean }) =>
      window.aecpilot.setRoutineEnabled({ profile, id: row.id, enabled: !row.enabled }),
    onSuccess: async (result) => {
      report(result)
      await reload()
    }
  })

  const runNow = useMutation({
    mutationFn: (id: string) => window.aecpilot.runRoutineNow({ profile, id }),
    onSuccess: (result) => void report(result)
  })

  const routines = data?.routines ?? []

  return (
    <div className="flex flex-col gap-1 border-t border-(--ui-stroke-secondary) pt-2 text-[11px]">
      <div className="flex items-center justify-between">
        <span className="text-(--ui-text-secondary)">{t('roster.routines')}</span>
        <Button
          aria-label={t('roster.routineAdd')}
          onClick={() => setAdding((on) => !on)}
          size="icon-xs"
          title={t('roster.routineAdd')}
          variant="ghost"
        >
          <Codicon name="add" />
        </Button>
      </div>

      {error && <div className="text-destructive">{error}</div>}

      {adding && (
        <div className="flex flex-col gap-1 rounded-[4px] bg-(--ui-bg-tertiary) p-1.5">
          <input
            aria-label={t('roster.routineName')}
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1"
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder={t('roster.routineName')}
            value={draft.name}
          />
          <textarea
            aria-label={t('roster.routinePrompt')}
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1"
            onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            placeholder={t('roster.routinePrompt')}
            rows={2}
            value={draft.prompt}
          />
          <input
            aria-label={t('roster.routineSchedule')}
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1"
            onChange={(event) => setDraft({ ...draft, schedule: event.target.value })}
            placeholder={t('roster.routineSchedulePlaceholder')}
            value={draft.schedule}
          />
          <div className="flex justify-end gap-1">
            <Button onClick={() => setAdding(false)} size="sm" variant="text">
              {t('common.cancel')}
            </Button>
            <Button disabled={create.isPending} onClick={() => create.mutate()} size="sm">
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}

      {routines.length === 0 ? (
        <span className="text-(--ui-text-secondary)">
          {(data?.totalOfAll ?? 0) > 0 ? t('roster.routinesElsewhere') : t('roster.routinesEmpty')}
        </span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {routines.map((routine) => (
            <li className="flex items-center gap-1" key={routine.id}>
              <span className={`min-w-0 flex-1 truncate ${routine.enabled ? '' : 'opacity-50'}`}>
                {routine.name || routine.prompt}
                <span className="text-(--ui-text-secondary)"> · {routine.schedule}</span>
              </span>
              <Button
                aria-label={t('roster.routineRunNow')}
                onClick={() => runNow.mutate(routine.id)}
                size="icon-xs"
                title={t('roster.routineRunNow')}
                variant="ghost"
              >
                <Codicon name="play" />
              </Button>
              <Button
                aria-label={routine.enabled ? t('roster.routinePause') : t('roster.routineResume')}
                onClick={() => toggle.mutate(routine)}
                size="icon-xs"
                title={routine.enabled ? t('roster.routinePause') : t('roster.routineResume')}
                variant="ghost"
              >
                <Codicon name={routine.enabled ? 'debug-pause' : 'debug-start'} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
