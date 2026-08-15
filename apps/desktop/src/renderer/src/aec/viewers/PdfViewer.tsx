// The minimal PDF viewer a citation opens (task 2.14).
//
// «Minimal» is the whole scope here: open the file, land on the page the
// citation names, and let the reader move around it. Tabs, text search and zoom
// controls are Phase 4 (task 4.1). What this must get right is the one thing
// AC1 measures — the page a citation points at is the page that appears.

import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { $openDocument, closeDocument, requestedPage } from './viewer-store'

type LoadedDocument = {
  pages: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs types are loaded lazily
  proxy: any
}

/** pdf.js is loaded on first use: it drags a worker and a font map with it, and
 *  a session that never opens a document should not pay for them. */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** What has been loaded, and for which request. Keeping the token in the state
 *  is what makes «loading» a derived value rather than a third flag to keep in
 *  sync: the viewer is loading exactly while the state it holds is not the
 *  state that was asked for. */
type ViewerState = {
  document?: LoadedDocument
  error?: string
  token: number
}

export function PdfViewer(): React.JSX.Element {
  const t = useAecT()
  const request = useStore($openDocument)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<ViewerState>({ token: 0 })
  const [page, setPage] = useState(1)

  const settled = request !== null && state.token === request.token
  const document = settled ? state.document : undefined
  const error = settled ? state.error : undefined
  const loading = request !== null && !settled

  // Load whenever a new request arrives. `token` is part of it so asking for
  // the same file twice re-lands on the cited page instead of leaving the
  // reader wherever they had scrolled to.
  useEffect(() => {
    if (!request) return

    let cancelled = false

    const load = async (): Promise<void> => {
      const result = await window.aecpilot.readDocument(request.relPath, request.sourceId)
      if (cancelled) return
      if (!result.ok) {
        setState({ error: result.error, token: request.token })
        return
      }

      try {
        const pdfjs = await loadPdfjs()
        const proxy = await pdfjs.getDocument({ data: new Uint8Array(result.bytes) }).promise
        if (cancelled) return
        setState({ document: { pages: proxy.numPages, proxy }, token: request.token })
        setPage(Math.min(requestedPage(request), proxy.numPages))
      } catch (cause: unknown) {
        if (cancelled) return
        setState({
          error: cause instanceof Error ? cause.message : String(cause),
          token: request.token
        })
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [request])

  // Draw the current page. Width-fitted: an engineer reads a drawing sheet, and
  // a fixed zoom either clips it or shrinks the text past reading.
  useEffect(() => {
    if (!document || !canvasRef.current) return

    let cancelled = false
    void (async () => {
      const rendered = await document.proxy.getPage(page)
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const available = canvas.parentElement?.clientWidth ?? 800
      const base = rendered.getViewport({ scale: 1 })
      const viewport = rendered.getViewport({ scale: Math.max(0.2, (available - 24) / base.width) })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) return
      await rendered.render({ canvas, canvasContext: context, viewport }).promise
    })()

    return () => {
      cancelled = true
    }
  }, [document, page])

  if (!request) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        {t('viewer.empty')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <span className="truncate text-sm font-medium" title={request.relPath}>
          {request.relPath.split('/').pop()}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            aria-label={t('viewer.previous')}
            disabled={!document || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            size="sm"
            variant="ghost"
          >
            ←
          </Button>
          <span className="text-muted-foreground min-w-16 text-center text-xs">
            {document ? t('viewer.pageOf', page, document.pages) : '—'}
          </span>
          <Button
            aria-label={t('viewer.next')}
            disabled={!document || page >= document.pages}
            onClick={() =>
              setPage((current) => Math.min(document?.pages ?? current, current + 1))
            }
            size="sm"
            variant="ghost"
          >
            →
          </Button>
          <Button aria-label={t('viewer.close')} onClick={closeDocument} size="sm" variant="ghost">
            ✕
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {loading ? <div className="text-muted-foreground text-sm">{t('viewer.opening')}</div> : null}
        {error ? (
          <div className="text-destructive space-y-2 text-sm">
            <div>{t('viewer.failed', error)}</div>
            <div className="text-muted-foreground">
              {request.sourceId ? `Источник: ${request.sourceId}. ` : ''}
              Путь: {request.relPath}
            </div>
          </div>
        ) : null}
        <canvas className="mx-auto block" ref={canvasRef} />
      </div>
    </div>
  )
}
