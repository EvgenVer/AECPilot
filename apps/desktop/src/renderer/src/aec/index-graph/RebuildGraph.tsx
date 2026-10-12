// «Перестроить граф» на вкладке «Граф» (задача 3L.7). Типы сущностей в промпте
// извлечения сменились на типы КР, а уже построенный граф хранит прежние —
// пока человек не извлечёт его заново. Это платно, поэтому порядок тот же, что
// у отметки в граф (UR24): сначала цена (`previewGraphRebuild` ничего не
// пишет), прогон — только кнопкой согласия.

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { GraphAddState, GraphPreview } from '../../../../shared/ipc'
import { forecastVerdict } from '../explorer/GraphAddDialog'

type Step =
  | { kind: 'idle' }
  | { kind: 'measuring' }
  | { error: string; kind: 'failed' }
  | { kind: 'forecast'; preview: GraphPreview }
  | { kind: 'mine' }

export function RebuildGraph(): React.JSX.Element {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [run, setRun] = useState<GraphAddState | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'idle' })

  useEffect(() => {
    void window.aecpilot.getGraphAddState().then(setRun)
    return window.aecpilot.onGraphAddState((next) => {
      setRun(next)
      // Конец прогона — новый граф: вкладка перечитывает его вместе с индикатором.
      if (!next.running) void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
    })
  }, [queryClient])

  const measure = async (): Promise<void> => {
    setStep({ kind: 'measuring' })
    const answer = await window.aecpilot.previewGraphRebuild()
    setStep(
      answer.ok
        ? { kind: 'forecast', preview: answer.preview }
        : { error: answer.error, kind: 'failed' }
    )
  }

  const start = async (): Promise<void> => {
    const answer = await window.aecpilot.startGraphRebuild()
    setStep(answer.started ? { kind: 'mine' } : { error: answer.error ?? '', kind: 'failed' })
  }

  if (run?.running) {
    return (
      <div className="text-muted-foreground text-xs">
        {t('graphAdd.running', run.progress?.done ?? 0, run.progress?.total ?? 0)}
      </div>
    )
  }

  if (step.kind === 'mine' && run?.lastReport) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span>{t('graphAdd.done', run.lastReport.documents_added, run.lastReport.chunks)}</span>
        {run.lastReport.failed > 0 && (
          <span className="text-destructive">
            {t('graphAdd.someFailed', run.lastReport.failed)}
          </span>
        )}
        {run.error && <span className="text-destructive">{run.error}</span>}
      </div>
    )
  }

  if (step.kind === 'forecast') {
    const verdict = forecastVerdict(step.preview)
    return (
      <div className="flex flex-col gap-1 rounded border border-(--stroke-nous) p-2 text-xs">
        {verdict === 'ready' ? (
          <>
            <span>{t('index.graph.rebuildWhat')}</span>
            <span>
              {t('graphAdd.forecast', step.preview.documents, step.preview.chunks_estimate)}
            </span>
            {step.preview.not_indexed > 0 && (
              <span className="text-amber-500">
                {t('graphAdd.notIndexed', step.preview.not_indexed)}
              </span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">{t('index.graph.rebuildNothing')}</span>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={() => setStep({ kind: 'idle' })} size="sm" variant="text">
            {t('common.cancel')}
          </Button>
          {verdict === 'ready' && (
            <Button onClick={() => void start()} size="sm">
              {t('index.graph.rebuildConfirm')}
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Button
        disabled={step.kind === 'measuring'}
        onClick={() => void measure()}
        size="sm"
        variant="outline"
      >
        {t('index.graph.rebuild')}
      </Button>
      {step.kind === 'measuring' && (
        <span className="text-muted-foreground">{t('graphAdd.measuring')}</span>
      )}
      {step.kind === 'failed' && (
        <span className="text-destructive">{t('graphAdd.failed', step.error)}</span>
      )}
    </div>
  )
}
