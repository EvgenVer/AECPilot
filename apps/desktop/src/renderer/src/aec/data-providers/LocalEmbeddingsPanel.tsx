// «Локальная модель» в окне «Индекс и память» (задача T83, UR53).
//
// Что человек видит ДО выбора: стоит ли движок, есть ли видеокарта и сколько
// займёт векторизация на этом компьютере — по скоростям, замеренным T83, для той
// сборки движка, которую выберет ядро. «Скачать» ставит движок ядра (их задание
// установки) и рекомендованную модель, затем запускает её. Другая модель — поиском
// ядра по Hugging Face или файлом с диска.

import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type {
  LocalModelAnswer,
  LocalEmbeddingsStatus,
  LocalModelFile,
  LocalModelSearchHit
} from '../../../../shared/ipc'

const inputClass =
  'min-w-0 flex-1 rounded border border-(--ui-border) bg-(--ui-bg-primary) p-1.5 text-xs text-(--ui-text-primary)'

const mb = (bytes: number): number => Math.round(bytes / 1_000_000)

export function LocalEmbeddingsPanel(): React.JSX.Element {
  const t = useAecT()
  const [status, setStatus] = useState<LocalEmbeddingsStatus | null>(null)
  const [error, setError] = useState('')
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LocalModelSearchHit[] | null>(null)
  const [repo, setRepo] = useState('')
  const [files, setFiles] = useState<LocalModelFile[] | null>(null)
  // Review T84: a new model would change the saved index model — asked first.
  const [pending, setPending] = useState<{
    warnings: string[]
    retry: () => Promise<LocalModelAnswer>
  } | null>(null)

  useEffect(() => {
    let alive = true
    void window.aecpilot.getLocalEmbeddings().then((next) => alive && setStatus(next))
    const off = window.aecpilot.onLocalEmbeddings((next) => alive && setStatus(next))
    return () => {
      alive = false
      off()
    }
  }, [])

  if (!status) return <p className="text-xs text-(--ui-text-secondary)">…</p>

  if (status.remote) {
    return (
      <p className="text-xs text-amber-500" data-testid="local-embeddings-remote">
        {t('dataProviders.local.remote', status.remoteReason ?? '')}
      </p>
    )
  }

  const run = async (work: (confirmed: boolean) => Promise<LocalModelAnswer>): Promise<void> => {
    setError('')
    setPending(null)
    const answer = await work(false)
    if (answer.warnings?.length) {
      setPending({ warnings: answer.warnings, retry: () => work(true) })
      return
    }
    if (!answer.ok && answer.error) setError(answer.error)
  }

  const confirm = async (): Promise<void> => {
    const retry = pending?.retry
    setPending(null)
    if (!retry) return
    const answer = await retry()
    if (!answer.ok && answer.error) setError(answer.error)
  }

  const progress = status.progress
  const progressText = !progress
    ? ''
    : progress.step === 'engine'
      ? t('dataProviders.local.progressEngine', progress.detail)
      : progress.step === 'model'
        ? t(
            'dataProviders.local.progressModel',
            mb(progress.doneBytes),
            progress.totalBytes ? String(mb(progress.totalBytes)) : '?'
          )
        : t('dataProviders.local.progressStart')

  const search = async (): Promise<void> => {
    setSearching(true)
    setFiles(null)
    const answer = await window.aecpilot.searchLocalModels(query.trim())
    setSearching(false)
    if (answer.ok) setHits(answer.hits ?? [])
    else setError(answer.error ?? '')
  }

  const openRepo = async (name: string): Promise<void> => {
    setRepo(name)
    const answer = await window.aecpilot.listLocalModelFiles(name)
    if (answer.ok) setFiles(answer.files ?? [])
    else setError(answer.error ?? '')
  }

  const recommended = status.recommended

  return (
    <div className="flex flex-col gap-1.5" data-testid="local-embeddings">
      <p className="text-xs text-(--ui-text-secondary)">{t('dataProviders.local.lead')}</p>
      <p className="text-xs text-(--ui-text-primary)" data-testid="local-embeddings-engine">
        {status.engine.installed
          ? t('dataProviders.local.engine', status.engine.backend ?? '')
          : t('dataProviders.local.engineNone')}
      </p>
      <p className="text-xs text-(--ui-text-primary)">
        {status.engine.gpuName
          ? t('dataProviders.local.gpu', status.engine.gpuName)
          : t('dataProviders.local.gpuNone')}
      </p>
      <p className="text-xs text-(--ui-text-primary)" data-testid="local-embeddings-model">
        {status.model
          ? t('dataProviders.local.model', status.model.id)
          : t('dataProviders.local.modelNone')}
        {status.model && (
          <span className="text-(--ui-text-secondary)">
            {' — '}
            {t(status.running ? 'dataProviders.local.running' : 'dataProviders.local.stopped')}
          </span>
        )}
      </p>
      <p className="text-xs text-(--ui-text-secondary)" data-testid="local-embeddings-estimate">
        {t(
          'dataProviders.local.estimate',
          status.estimate.chunksPerMinute,
          status.estimate.benchChunks,
          status.estimate.benchMinutes
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={status.busy}
          onClick={() => void run((confirmed) => window.aecpilot.setupLocalEmbeddings(confirmed))}
          size="sm"
          variant="secondary"
        >
          {t(
            'dataProviders.local.download',
            recommended.id,
            mb(recommended.sizeBytes),
            recommended.license
          )}
        </Button>
        <Button
          disabled={status.busy}
          onClick={() => setHits((current) => (current === null ? [] : null))}
          size="sm"
          variant="ghost"
        >
          {t('dataProviders.local.other')}
        </Button>
        <Button
          disabled={status.busy}
          onClick={() => void run((confirmed) => window.aecpilot.pickLocalModelFile(confirmed))}
          size="sm"
          variant="ghost"
        >
          {t('dataProviders.local.fromFile')}
        </Button>
      </div>
      {progressText && (
        <p className="text-xs text-(--ui-text-primary)" data-testid="local-embeddings-progress">
          {progressText}
        </p>
      )}

      {hits !== null && (
        <div className="flex flex-col gap-1 rounded border border-(--ui-border) p-2">
          <div className="flex items-center gap-2">
            <input
              aria-label={t('dataProviders.local.searchPlaceholder')}
              className={inputClass}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && query.trim()) void search()
              }}
              placeholder={t('dataProviders.local.searchPlaceholder')}
              value={query}
            />
            <Button
              disabled={searching || !query.trim()}
              onClick={() => void search()}
              size="sm"
              variant="ghost"
            >
              {t('dataProviders.local.search')}
            </Button>
          </div>
          {!searching && query.trim() && hits.length === 0 && (
            <p className="text-xs text-(--ui-text-secondary)">
              {t('dataProviders.local.searchEmpty')}
            </p>
          )}
          {hits.map((hit) => (
            <button
              className="text-left text-xs text-(--ui-text-primary) hover:underline disabled:opacity-50"
              disabled={hit.gated}
              key={hit.repo}
              onClick={() => void openRepo(hit.repo)}
              type="button"
            >
              {hit.repo} · ↓{hit.downloads}
            </button>
          ))}
          {files && (
            <div className="flex flex-col gap-1 border-t border-(--ui-border) pt-1">
              <p className="text-xs font-semibold text-(--ui-text-primary)">
                {t('dataProviders.local.files')}: {repo}
              </p>
              {files.map((file) => (
                <Button
                  disabled={status.busy}
                  key={file.label}
                  onClick={() =>
                    void run((confirmed) =>
                      window.aecpilot.downloadLocalModel(repo, file.paths, confirmed)
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  {t('dataProviders.local.pickFile', file.label, mb(file.totalBytes))}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {pending && (
        <div
          className="flex flex-col gap-1 rounded border border-amber-500/50 p-2"
          data-testid="local-embeddings-warning"
        >
          {pending.warnings.map((warning) => (
            <p className="text-xs text-(--ui-text-primary)" key={warning}>
              {warning}
            </p>
          ))}
          <div className="flex gap-2">
            <Button onClick={() => void confirm()} size="sm" variant="secondary">
              {t('dataProviders.local.continueAnyway')}
            </Button>
            <Button onClick={() => setPending(null)} size="sm" variant="ghost">
              {t('dataProviders.local.cancel')}
            </Button>
          </div>
        </div>
      )}

      {(error || status.error) && (
        <p className="text-xs text-(--ui-text-danger)" data-testid="local-embeddings-error">
          {error || status.error}
        </p>
      )}
    </div>
  )
}
