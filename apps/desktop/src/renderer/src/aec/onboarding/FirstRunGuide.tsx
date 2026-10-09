// Мастер первого запуска (task 3.20): шесть шагов (седьмой — у агента по подписке,
// задача 3G.48) от пустой установки до
// первого ответа агента, без терминала.
//
// Список, а не последовательность экранов. Два шага из шести — ключ и модель —
// делаются на вендоренном экране донора, который поднимается сам; здесь у них
// только строка состояния и кнопка «открыть его снова». Остальные четыре — наши,
// и у каждого ровно одно действие. Логика «какой шаг сейчас» вынесена в
// `onboarding-pure.ts` и покрыта тестами; здесь — вызовы и разметка.
//
// Панель не блокирующая и живёт в углу: последний шаг кладёт вопрос в поле
// ввода, и накрыть это поле собой было бы саботажем собственного сценария.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { IngestState, OpenProject } from '../../../../shared/ipc'
import { $dataProviders, isSubscriptionProvider, openDataProviders } from '../data-providers/store'

import { fillComposer, onProviderConfigured, openProviderSetup } from './bridge'
import {
  GUIDE_STORAGE_KEY,
  guideSteps,
  isGuideComplete,
  readGuideMemory,
  suggestedQuestionKey,
  writeGuideMemory,
  type GuideMemory,
  type GuideStep,
  type GuideStepId
} from './onboarding-pure'

const IDLE_INGEST: IngestState = {
  error: null,
  failure: null,
  files: [],
  interrupted: null,
  lastReport: null,
  progress: null,
  running: false,
  stopping: false
}

/** Мастер — только в главном окне. Корень рендерера общий у всех окон, и без
 *  этой проверки панель вставала и в полосу быстрого ввода (`?win=hud`), и во
 *  второе окно, и в окно браузера — там она закрывала собой всё (D-118). */
export default function FirstRunGuide(): React.JSX.Element | null {
  if (new URLSearchParams(window.location.search).get('win') !== null) return null
  return <ProjectGuide />
}

function ProjectGuide(): React.JSX.Element | null {
  const project = useQuery({
    queryKey: ['aec', 'onboarding', 'project'],
    queryFn: () => window.aecpilot.getCurrentProject()
  })

  if (!project.data) return null

  // Смена проекта — это другая память и другие факты, поэтому не общий стейт с
  // подстройкой, а новый узел по ключу.
  return <GuideMemoryHolder key={project.data.vaultPath} project={project.data} />
}

function GuideMemoryHolder({ project }: { project: OpenProject }): React.JSX.Element | null {
  // Один проект — одна память, и читается она синхронно, до всего остального:
  // закрытый мастер не должен стоить ни одного запроса к ядру на каждом старте.
  const [memory, setMemory] = useState<GuideMemory>(() =>
    readGuideMemory(window.localStorage.getItem(GUIDE_STORAGE_KEY), project.vaultPath)
  )

  const remember = useCallback(
    (patch: Partial<GuideMemory>) => {
      setMemory((current) => {
        const next = { ...current, ...patch }
        window.localStorage.setItem(
          GUIDE_STORAGE_KEY,
          writeGuideMemory(window.localStorage.getItem(GUIDE_STORAGE_KEY), project.vaultPath, next)
        )
        return next
      })
    },
    [project.vaultPath]
  )

  if (memory.closed) return null

  return <Guide memory={memory} project={project} remember={remember} />
}

function Guide({
  memory,
  project,
  remember
}: {
  memory: GuideMemory
  project: OpenProject
  remember: (patch: Partial<GuideMemory>) => void
}): React.JSX.Element | null {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [pendingSource, setPendingSource] = useState<
    { rootPath: string; warnings: string[] } | undefined
  >(undefined)
  const [ingest, setIngest] = useState<IngestState>(IDLE_INGEST)

  const runtime = useQuery({
    queryKey: ['aec', 'onboarding', 'runtime'],
    queryFn: () => window.aecpilot.checkRuntime()
  })
  const models = useQuery({
    queryKey: ['aec', 'onboarding', 'model'],
    queryFn: () => window.aecpilot.getModelOptions()
  })
  const sources = useQuery({
    queryKey: ['aec', 'onboarding', 'sources'],
    queryFn: () => window.aecpilot.listSources()
  })
  const index = useQuery({
    queryKey: ['aec', 'onboarding', 'index'],
    queryFn: () => window.aecpilot.getIndexStatus()
  })
  // Задача 3G.48: провайдер для индекса и памяти — шаг только у агента по подписке.
  const data = useQuery({
    queryKey: ['aec', 'onboarding', 'data'],
    queryFn: () => window.aecpilot.getDataProviders()
  })

  const recheck = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['aec', 'onboarding'] }),
    [queryClient]
  )

  // Ключ и модель настраиваются на их экране; о его успехе мы узнаём только по
  // их же признаку готовности.
  useEffect(() => onProviderConfigured(() => void recheck()), [recheck])
  // Выбор сохраняется в окне «Индекс и память»; оно перечитывает своё состояние, и
  // шаг узнаёт об этом оттуда же.
  useEffect(() => $dataProviders.listen(() => void recheck()), [recheck])

  useEffect(() => {
    void window.aecpilot.getIngestState().then(setIngest)
    return window.aecpilot.onIngestState((next) => {
      setIngest(next)
      if (!next.running)
        void queryClient.invalidateQueries({ queryKey: ['aec', 'onboarding', 'index'] })
    })
  }, [queryClient])

  const sourceCount = sources.data?.length ?? 0
  const steps = guideSteps({
    hasProject: true,
    runtimeOk: runtime.data?.ok === true,
    model: models.data?.model ?? null,
    sourceCount,
    filesIndexed: index.data?.ok ? index.data.status.files_indexed : 0,
    asked: memory.asked,
    skipped: memory.skipped,
    dataStep: !isSubscriptionProvider(data.data?.agentProvider ?? null)
      ? 'hidden'
      : data.data?.rag.ok && data.data.memory.ok
        ? 'done'
        : 'needed'
  })
  const current = steps.find((step) => step.state === 'current')
  const complete = isGuideComplete(steps)

  // Дойдя до конца, мастер закрывается сам и на этот проект больше не
  // поднимается — иначе он превращается в панель, которую надо закрывать
  // руками при каждом запуске.
  useEffect(() => {
    if (complete) remember({ closed: true })
  }, [complete, remember])

  const skip = useCallback(
    (id: GuideStepId) => remember({ skipped: [...memory.skipped, id] }),
    [memory.skipped, remember]
  )

  const addSource = useCallback(
    async (rootPath: string, confirmed: boolean) => {
      setBusy(true)
      setError(undefined)
      try {
        const result = await window.aecpilot.addSource(rootPath, confirmed)
        if ('needsConfirm' in result) {
          setPendingSource({ rootPath, warnings: result.needsConfirm })
          return
        }
        setPendingSource(undefined)
        if (!result.ok) {
          setError(result.errors.join('\n'))
          return
        }
        await recheck()
      } finally {
        setBusy(false)
      }
    },
    [recheck]
  )

  const pickSource = useCallback(async () => {
    setError(undefined)
    // Тот же системный диалог, что и везде: путь приходит из main, рендерер его
    // не сочиняет.
    const picked = await window.aecpilot.pickProjectDirectory()
    if (picked) await addSource(picked, false)
  }, [addSource])

  const startIngest = useCallback(async () => {
    setError(undefined)
    const result = await window.aecpilot.startIngest()
    if (!result.started) setError(result.error ?? t('onboarding.indexFailed'))
  }, [t])

  const ask = useCallback(() => {
    fillComposer(t(suggestedQuestionKey(sourceCount)))
    remember({ asked: true })
  }, [remember, sourceCount, t])

  if (complete) return null

  return (
    <div
      aria-label={t('onboarding.title')}
      className="fixed right-4 bottom-4 z-40 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-4 shadow-lg"
      role="region"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-(--ui-text-primary)">
            {t('onboarding.title')}
          </span>
          <span className="text-xs text-(--ui-text-secondary)">
            {t('onboarding.subtitle', project.name)}
          </span>
        </div>
        <Button
          aria-label={t('common.close')}
          onClick={() => remember({ closed: true })}
          size="sm"
          variant="ghost"
        >
          <span aria-hidden className="codicon codicon-close" />
        </Button>
      </div>

      <ol className="flex flex-col gap-1">
        {steps.map((step, position) => (
          <StepRow key={step.id} position={position + 1} step={step} />
        ))}
      </ol>

      {current ? (
        <div className="flex flex-col gap-2 border-t border-(--ui-stroke-secondary) pt-3">
          <div className="text-xs text-(--ui-text-secondary)">
            {t(`onboarding.hint.${current.id}`)}
          </div>

          {current.id === 'index' && ingest.running ? (
            <div className="text-xs text-(--ui-text-secondary)">
              {t(
                'onboarding.indexRunning',
                ingest.progress?.done ?? 0,
                ingest.progress?.total ?? 0
              )}
            </div>
          ) : null}

          {pendingSource ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs text-amber-500">{pendingSource.warnings.join('\n')}</div>
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  onClick={() => void addSource(pendingSource.rootPath, true)}
                  size="sm"
                >
                  {t('sources.addAnyway')}
                </Button>
                <Button onClick={() => setPendingSource(undefined)} size="sm" variant="ghost">
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={busy || (current.id === 'index' && ingest.running)}
                onClick={() => {
                  if (current.id === 'key' || current.id === 'model') openProviderSetup()
                  else if (current.id === 'data') openDataProviders()
                  else if (current.id === 'sources') void pickSource()
                  else if (current.id === 'index') void startIngest()
                  else if (current.id === 'ask') ask()
                }}
                size="sm"
              >
                {t(`onboarding.action.${current.id}`)}
              </Button>
              {current.optional ? (
                <Button onClick={() => skip(current.id)} size="sm" variant="ghost">
                  {t('onboarding.skip')}
                </Button>
              ) : null}
            </div>
          )}

          {error ? <div className="text-xs text-destructive">{error}</div> : null}
          {ingest.error && current.id === 'index' ? (
            <div className="text-xs text-destructive">{ingest.error}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

const STATE_ICON: Record<GuideStep['state'], string> = {
  current: 'codicon-arrow-right',
  done: 'codicon-pass-filled',
  skipped: 'codicon-circle-slash',
  waiting: 'codicon-circle-large-outline'
}

function StepRow({ position, step }: { position: number; step: GuideStep }): React.JSX.Element {
  const t = useAecT()
  const muted = step.state === 'waiting' || step.state === 'skipped'

  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className={`codicon ${STATE_ICON[step.state]} ${
          step.state === 'done' ? 'text-emerald-500' : 'text-(--ui-text-secondary)'
        }`}
      />
      <span className={muted ? 'text-(--ui-text-secondary)' : 'text-(--ui-text-primary)'}>
        {position}. {t(`onboarding.step.${step.id}`)}
      </span>
      {step.state === 'skipped' ? (
        <span className="text-(--ui-text-secondary)">— {t('onboarding.skipped')}</span>
      ) : null}
    </li>
  )
}
