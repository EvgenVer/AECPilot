// Preview panel of the artifacts tab (task 1.6.B7.5).
//
// The bytes are read by the MAIN process and arrive as a data-URL. The renderer
// never touches the filesystem and never builds a `file://` src: a `file://`
// image in this window would be the renderer reading whatever path the model
// wrote, which is the whole thing the fence in `artifact-files-pure.ts` exists
// to prevent. Everything refused there — outside the project, a symlink
// pointing out of it, `svg`, an oversized file — comes back here as a sentence
// rather than a broken image.
//
// The component is mounted with `key={record.id}`, so a different artifact
// REMOUNTS it. That is what keeps the effect below free of the "clear the
// previous artifact's state" writes that `react-hooks/set-state-in-effect`
// rejects — and it is also simply correct: nothing of the old preview should
// survive into the new one.

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ArtifactRecord } from './artifact-extract'

/** An http(s) or data URL is already addressable by the window; only a local
 * file has to come through main. Derived, not stored, so showing a remote image
 * needs no state write at all. */
function directSrc(record: ArtifactRecord): string {
  return record.kind === 'image' && /^(?:https?:|data:)/i.test(record.value) ? record.value : ''
}

export default function ArtifactPreview({
  record,
  onClose
}: {
  record: ArtifactRecord
  onClose: () => void
}): JSX.Element {
  const [dataUrl, setDataUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (record.kind !== 'image' || directSrc(record)) return
    let active = true
    void window.aecpilot.previewArtifact(record.value).then((result) => {
      if (!active) return
      setLoading(false)
      if (result.ok) setDataUrl(result.dataUrl)
      else setError(result.error)
    })
    // Announced through a microtask so the effect body itself writes no state
    // (see the header): the read is in flight either way.
    queueMicrotask(() => {
      if (active) setLoading(true)
    })
    return () => {
      active = false
    }
  }, [record])

  const src = directSrc(record) || dataUrl

  return (
    <aside className="artifact-preview" aria-label="Предпросмотр артефакта">
      <div className="artifact-preview__head">
        <span className="artifact-preview__title" title={record.value}>
          {record.label}
        </span>
        <button
          type="button"
          className="artifacts__icon-btn"
          aria-label="Закрыть предпросмотр"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="artifact-preview__body">
        {record.kind !== 'image' ? (
          <p className="artifact-preview__note">
            Предпросмотр есть только у картинок. Этот артефакт можно показать в проводнике или
            скопировать его путь.
          </p>
        ) : error ? (
          <p className="artifact-preview__note artifact-preview__note--error" role="alert">
            {error}
          </p>
        ) : src ? (
          <img
            className="artifact-preview__image"
            src={src}
            alt={record.label}
            onError={() => setError('Файл не читается как картинка')}
          />
        ) : loading ? (
          <p className="artifact-preview__note">Читаем файл…</p>
        ) : null}
      </div>
      <div className="artifact-preview__path">{record.value}</div>
    </aside>
  )
}
