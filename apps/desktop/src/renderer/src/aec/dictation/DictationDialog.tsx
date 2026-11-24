// The dictation dialog (UR49, task T59): the consent to download the recognition model, its
// progress, and afterwards the way to remove it. A press on the microphone opens it only while
// the model is missing; the palette command opens it any time.

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import { CloseOnEscape } from '../CloseOnEscape'

import { $dictation, $dictationOpen, refreshDictation } from './store'

const mb = (bytes: number): number => Math.round(bytes / 1_000_000)

export default function DictationDialog(): React.JSX.Element | null {
  const t = useAecT()
  const open = useStore($dictationOpen)
  const status = useStore($dictation)
  const [error, setError] = useState('')

  useEffect(() => {
    // Also primes the gate: by the first press the answer is already here.
    void refreshDictation().catch(() => undefined)
    return window.aecpilot.onDictation((next) => $dictation.set(next))
  }, [])

  if (!open) return null

  const close = (): void => {
    setError('')
    $dictationOpen.set(false)
  }
  const run = async (work: () => Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    setError('')
    const answer = await work().catch((failure: unknown) => ({
      ok: false,
      error: failure instanceof Error ? failure.message : String(failure)
    }))
    if (!answer.ok) setError(answer.error ?? t('dictation.failed'))
    void refreshDictation().catch(() => undefined)
  }
  const offer = status && !status.remote && status.engine && !status.installed
  const size = mb(status?.model.sizeBytes ?? 0)

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      data-testid="dictation-dialog"
    >
      <CloseOnEscape onClose={close} />
      <div
        aria-label={t('dictation.title')}
        aria-modal="true"
        className="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border border-(--ui-border) bg-popover p-4 text-popover-foreground shadow-lg"
        role="dialog"
      >
        <h2 className="text-sm font-semibold">{t('dictation.title')}</h2>
        {!status && <p className="text-xs text-(--ui-text-secondary)">…</p>}
        {status?.remote && (
          <p className="text-xs" data-testid="dictation-remote">
            {t(status.ready ? 'dictation.remoteOn' : 'dictation.remoteOff')}
          </p>
        )}
        {status && !status.remote && !status.engine && (
          <p className="text-xs text-amber-500" data-testid="dictation-engine-missing">
            {t('dictation.engineMissing')}
          </p>
        )}
        {offer && (
          <>
            <p className="text-xs">{t('dictation.lead')}</p>
            <ul className="list-disc space-y-1 pl-4 text-xs text-(--ui-text-secondary)">
              <li>{t('dictation.source', status.model.repo, size, status.model.license)}</li>
              <li>{t('dictation.once')}</li>
              <li>{t('dictation.privacy')}</li>
              <li>{t('dictation.microphone')}</li>
            </ul>
          </>
        )}
        {status && !status.remote && status.engine && status.installed && (
          <p className="text-xs" data-testid="dictation-installed">
            {t(
              status.ready ? 'dictation.installed' : 'dictation.installedBlocked',
              status.model.repo,
              size
            )}
          </p>
        )}
        {status?.busy && (
          <p className="text-xs" data-testid="dictation-progress" role="status">
            {t(
              'dictation.progress',
              mb(status.progress?.doneBytes ?? 0),
              mb(status.progress?.totalBytes ?? status.model.sizeBytes)
            )}
          </p>
        )}
        {(error || status?.error) && !status?.busy && (
          <p className="text-xs text-red-500" data-testid="dictation-error" role="alert">
            {error || status?.error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {offer && (
            <Button
              data-testid="dictation-download"
              disabled={status.busy}
              onClick={() => void run(() => window.aecpilot.setupDictation())}
              size="sm"
            >
              {t('dictation.download')}
            </Button>
          )}
          {status && !status.remote && (status.installed || status.leftovers) && (
            <Button
              data-testid="dictation-remove"
              disabled={status.busy}
              onClick={() => void run(() => window.aecpilot.removeDictation())}
              size="sm"
              variant="outline"
            >
              {t(status.installed ? 'dictation.remove' : 'dictation.removeLeftovers')}
            </Button>
          )}
          <Button data-testid="dictation-close" onClick={close} size="sm" variant="ghost">
            {t(offer && !status.busy ? 'dictation.later' : 'dictation.close')}
          </Button>
        </div>
      </div>
    </div>
  )
}
