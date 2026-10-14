// Подтверждение перед уровнем 2 (задача 5.15, SPECIFICATION UR24).
//
// ЧТО ЭТО ОКНО ОБЯЗАНО СКАЗАТЬ ДО ЗАПУСКА: сколько документов и какой объём
// фрагментов. Не «вы уверены?» — эта фраза не содержит цены. Граф стоит вызова
// модели на каждый фрагмент (R6, замер eval/graph-cost-report.md: 1,97 с и два
// вызова на фрагмент), и человек имеет право увидеть счёт до того, как он
// появится.
//
// ОТКАЗ НИЧЕГО НЕ ИНДЕКСИРУЕТ — и это свойство устройства, а не обещание:
// прогноз считает отдельная команда, которая не пишет в проект НИЧЕГО, а
// отметка и построение живут во второй, и зовёт её только кнопка согласия.
// Отката у отказа нет, потому что откатывать нечего.
//
// ЧИСЛО В ПОДТВЕРЖДЕНИИ — ПРО ВЕСЬ ПРОГОН. Если в уже отмеченной папке ждут
// новые файлы, прогон добавит и их: показывать только «эту папку» значило бы
// назвать цену ниже настоящей.

import { useStore } from '@nanostores/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import { CloseOnEscape } from '../CloseOnEscape'
import { graphRunText, graphStoppedText } from '../index-graph/graph-run-text'
import { StopGraphRun } from '../index-graph/StopGraphRun'
import type { GraphAddState } from '../../../../shared/ipc'

import { $graphTarget, closeGraphAdd } from './graph-add-store'

const IDLE: GraphAddState = {
  error: null,
  failure: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false
}

export function GraphAddDialog(): React.JSX.Element | null {
  const t = useAecT()
  const target = useStore($graphTarget)
  const queryClient = useQueryClient()
  const [run, setRun] = useState<GraphAddState>(IDLE)
  const [startError, setStartError] = useState('')
  // Итог показывается только тому окну, которое прогон и завело: чужой отчёт
  // прошлого прогона читался бы как ответ на этот вопрос.
  const [mine, setMine] = useState(false)

  useEffect(() => {
    void window.aecpilot.getGraphAddState().then(setRun)
    return window.aecpilot.onGraphAddState((next) => {
      setRun(next)
      // Конец прогона меняет каждое число индикатора индекса.
      if (!next.running) void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
    })
  }, [queryClient])

  const preview = useQuery({
    enabled: target !== null,
    queryKey: ['aec', 'graph-preview', target?.sourceId, target?.rel, target?.kind],
    queryFn: () => window.aecpilot.previewGraphAdd(target!.sourceId, target!.rel, target!.kind)
  })

  if (!target) return null

  const close = (): void => {
    setStartError('')
    setMine(false)
    closeGraphAdd()
  }

  const start = async (): Promise<void> => {
    setStartError('')
    const answer = await window.aecpilot.startGraphAdd(target.sourceId, target.rel, target.kind)
    if (!answer.started) {
      setStartError(answer.error ?? '')
      return
    }
    setMine(true)
  }

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      onClick={close}
      role="presentation"
    >
      <CloseOnEscape onClose={close} />
      <div
        aria-label={t('graphAdd.title')}
        aria-modal="true"
        className="flex w-full max-w-md flex-col gap-3 rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">{t('graphAdd.title')}</h2>
        <p className="text-xs text-(--ui-text-secondary)">{t('graphAdd.target', target.label)}</p>

        <Body mine={mine} preview={preview} run={run} />

        {startError && <p className="text-xs text-destructive">{startError}</p>}
        {run.error && <p className="text-xs text-destructive">{run.error}</p>}

        <div className="flex justify-end gap-2">
          <Button onClick={close} size="sm" variant="text">
            {t('common.close')}
          </Button>
          {canRun(preview, run) && (
            <Button onClick={() => void start()} size="sm">
              {t('graphAdd.confirm')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

type PreviewQuery = ReturnType<
  typeof useQuery<Awaited<ReturnType<typeof window.aecpilot.previewGraphAdd>>>
>

/** Кнопка согласия существует только когда есть на что соглашаться: прогноз
 *  прочитан, работа в нём есть, и прогон ещё не идёт. */
function canRun(preview: PreviewQuery, run: GraphAddState): boolean {
  if (run.running || preview.isFetching) return false
  const answer = preview.data
  return answer?.ok === true && forecastVerdict(answer.preview) === 'ready'
}

/** Что показать по прогнозу. «Не проиндексировано» — не только когда индекса
 *  нет вовсе, но и когда из выбранного не проиндексирован НИ ОДИН документ:
 *  графу читать нечего, и согласие ничего бы не добавило (чек-лист 40.2.2,
 *  замер 24.09.2026 — окно предлагало «Добавить» на 0 фрагментов). */
export function forecastVerdict(forecast: {
  documents: number
  index_missing?: boolean
  not_indexed: number
}): 'index-missing' | 'nothing' | 'ready' {
  if (forecast.index_missing) return 'index-missing'
  if (forecast.documents === 0) return 'nothing'
  if (forecast.not_indexed >= forecast.documents) return 'index-missing'
  return 'ready'
}

function Body({
  preview,
  run,
  mine
}: {
  mine: boolean
  preview: PreviewQuery
  run: GraphAddState
}): React.JSX.Element {
  const t = useAecT()

  if (run.running) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-(--ui-text-primary)">{graphRunText(t, run.progress)}</span>
        <span className="text-(--ui-text-secondary)">{t('graphAdd.runningHint')}</span>
        <div>
          <StopGraphRun stopping={run.stopping === true} />
        </div>
      </div>
    )
  }

  if (mine && run.stopped) {
    return <p className="text-xs text-(--ui-text-primary)">{graphStoppedText(t, run.stopped)}</p>
  }

  if (mine && run.lastReport) {
    const report = run.lastReport
    return (
      <div className="flex flex-col gap-1 text-xs">
        <span className="text-(--ui-text-primary)">
          {t('graphAdd.done', report.documents_added, report.chunks)}
        </span>
        {report.failed > 0 && (
          <span className="text-destructive">{t('graphAdd.someFailed', report.failed)}</span>
        )}
      </div>
    )
  }

  if (preview.isFetching || !preview.data) {
    return <p className="text-xs text-(--ui-text-secondary)">{t('graphAdd.measuring')}</p>
  }
  if (!preview.data.ok) {
    return <p className="text-xs text-destructive">{t('graphAdd.failed', preview.data.error)}</p>
  }

  const forecast = preview.data.preview
  const verdict = forecastVerdict(forecast)
  if (verdict === 'index-missing') {
    return <p className="text-xs text-(--ui-text-secondary)">{t('graphAdd.indexMissing')}</p>
  }
  if (verdict === 'nothing') {
    return <p className="text-xs text-(--ui-text-secondary)">{t('graphAdd.nothing')}</p>
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-(--ui-text-primary)">
        {t('graphAdd.forecast', forecast.documents, forecast.chunks_estimate)}
      </span>
      {forecast.not_indexed > 0 && (
        <span className="text-amber-500">{t('graphAdd.notIndexed', forecast.not_indexed)}</span>
      )}
      {forecast.adds.length === 0 && (
        <span className="text-(--ui-text-secondary)">{t('graphAdd.pendingNote')}</span>
      )}
    </div>
  )
}
