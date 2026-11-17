// The PDF viewer a citation opens (task 2.14; поиск и зум — задача 4.1;
// сплошная прокрутка и Ctrl+колесо — задача T76, UR55).
//
// What this must get right above everything else is the one thing AC1 measures:
// the page a citation points at is the page that appears. Задача 4.1 добавила
// масштаб и поиск по тексту.
//
// Задача T76 (замечание владельца 5 на 0.1.0): документ читается ЛЕНТОЙ, как в
// любом просмотрщике PDF, — колесо листает страницы подряд, а не одну страницу с
// кнопками; Ctrl+колесо меняет масштаб. Страница рисуется, когда подъезжает к
// полю зрения (`IntersectionObserver`): сорок листов чертежа холстами сразу —
// это сотни мегабайт памяти ради страниц, которых человек не увидит. Счётчик
// «N из M» следует за прокруткой, а стрелки, ссылка и поиск прокручивают ленту.
//
// Вкладки живут этажом выше, в `DocumentViewer`: они общие для всех форматов.

import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import {
  MIN_QUERY,
  findMatches,
  matchNearPage,
  toSearchable,
  type Match,
  type SearchablePage,
  type TextPiece
} from './pdf-search'
import { nextZoomStep, pageAtOffset } from './pdf-scroll-pure'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument, requestedPage } from './viewer-store'

type LoadedDocument = {
  pages: number
  /** Размер первой страницы при масштабе 1 — заготовка для ещё не нарисованных. */
  base: { height: number; width: number }
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
 *  sync. */
type ViewerState = {
  document?: LoadedDocument
  error?: string
  token: number
}

/** `null` — по ширине панели; так документ открывается по умолчанию. */
type Zoom = number | null

type Rect = { left: number; top: number; width: number; height: number }

/** Промежуток между страницами ленты, px. */
const PAGE_GAP = 12

/** Прямоугольник куска текста в координатах холста. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs viewport
function pieceRect(piece: TextPiece, viewport: any): Rect {
  const [x1, y1] = viewport.convertToViewportPoint(piece.x, piece.y + piece.height)
  const [x2, y2] = viewport.convertToViewportPoint(piece.x + piece.width, piece.y)
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  }
}

type PageHighlight = { active: boolean; pieces: TextPiece[] }

/** Одна страница ленты. До первого появления в поле зрения — пустая заготовка
 *  размера первой страницы; нарисованная — холст своего размера. */
function PdfPage({
  activeRef,
  base,
  highlights,
  number,
  proxy,
  scale,
  setElement
}: {
  activeRef: React.RefObject<HTMLDivElement | null>
  base: { height: number; width: number }
  highlights: PageHighlight[]
  number: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs document
  proxy: any
  scale: number
  setElement: (number: number, element: HTMLDivElement | null) => void
}): React.JSX.Element {
  const holderRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Без наблюдателя (старый движок, тесты) страница видна сразу: лишняя память
  // лучше пустой страницы.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs viewport
  const [viewport, setViewport] = useState<any>(null)

  useEffect(() => {
    const holder = holderRef.current
    if (!holder || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
      },
      { rootMargin: '800px 0px' }
    )
    observer.observe(holder)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs render task
    let task: any = null
    void (async () => {
      const page = await proxy.getPage(number)
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const next = page.getViewport({ scale })
      canvas.width = Math.floor(next.width)
      canvas.height = Math.floor(next.height)
      const context = canvas.getContext('2d')
      if (!context) return
      task = page.render({ canvas, canvasContext: context, viewport: next })
      try {
        await task.promise
      } catch {
        return // отменён новой отрисовкой — не ошибка
      }
      if (!cancelled) setViewport(next)
    })()
    return () => {
      cancelled = true
      task?.cancel?.()
    }
  }, [visible, proxy, number, scale])

  const width = viewport?.width ?? base.width * scale
  const height = viewport?.height ?? base.height * scale

  return (
    <div
      className="relative mx-auto bg-white shadow-sm"
      data-page={number}
      ref={(element) => {
        holderRef.current = element
        setElement(number, element)
      }}
      style={{ height, width }}
    >
      <canvas className="block" ref={canvasRef} />
      {viewport
        ? highlights.flatMap((highlight, index) =>
            highlight.pieces.map((piece, at) => (
              <div
                className={
                  highlight.active
                    ? 'pointer-events-none absolute bg-amber-400/60'
                    : 'pointer-events-none absolute bg-amber-300/30'
                }
                key={`${index}-${at}`}
                ref={highlight.active && at === 0 ? activeRef : undefined}
                style={pieceRect(piece, viewport)}
              />
            ))
          )
        : null}
    </div>
  )
}

export function PdfViewer(): React.JSX.Element {
  const t = useAecT()
  const request = useStore($openDocument)
  const [state, setState] = useState<ViewerState>({ token: 0 })
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState<Zoom>(null)
  const [paneWidth, setPaneWidth] = useState(800)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Ревью T84: ленты нет, пока окно пустое, а экземпляр компонента живёт дальше —
  // слушатели вешаются, когда лента появилась, а не один раз при подъёме.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const attachScroller = useCallback((node: HTMLDivElement | null): void => {
    scrollRef.current = node
    setScroller(node)
  }, [])
  const pageElements = useRef(new Map<number, HTMLDivElement>())
  const setPageElement = useCallback((number: number, element: HTMLDivElement | null) => {
    if (element) pageElements.current.set(number, element)
    else pageElements.current.delete(number)
  }, [])

  const [search, setSearch] = useState<{ key: string; query: string }>({ key: '', query: '' })
  const [cursor, setCursor] = useState<{ query: string; at: number }>({ query: '', at: 0 })
  const [text, setText] = useState<{ token: number; pages: SearchablePage[] } | null>(null)

  const settled = request !== null && state.token === request.token
  const document = settled ? state.document : undefined
  const error = settled ? state.error : undefined
  const loading = request !== null && !settled

  const documentKey = request ? `${request.sourceId ?? ''} ${request.relPath}` : ''
  const query = search.key === documentKey ? search.query : ''
  const searching = query.trim().length >= MIN_QUERY
  const extracting = searching && text?.token !== request?.token

  const scale = document ? (zoom ?? Math.max(0.2, (paneWidth - 24) / document.base.width)) : 1

  /** Прокрутить ленту к странице. Счётчик ставится сразу, а событие прокрутки,
   *  которое вызовет эта прокрутка, пропускается: у последних страниц лента
   *  упирается в низ, и счётчик по положению показал бы предыдущую — а человек
   *  просил именно эту. */
  const ignoreNextScroll = useRef(false)
  const scrollToPage = useCallback((number: number): void => {
    setPage(number)
    const element = pageElements.current.get(number)
    const scroller = scrollRef.current
    if (!element || !scroller) return
    const before = scroller.scrollTop
    scroller.scrollTop = element.offsetTop - PAGE_GAP
    if (scroller.scrollTop !== before) ignoreNextScroll.current = true
  }, [])

  // Ширина панели — для масштаба «по ширине».
  useEffect(() => {
    if (!scroller || typeof ResizeObserver === 'undefined') return
    // Первый замер приходит от самого наблюдателя: он сообщает размер сразу.
    const observer = new ResizeObserver(() => setPaneWidth(scroller.clientWidth || 800))
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [scroller])

  // Load whenever a new request arrives. `token` is part of it so asking for
  // the same file twice re-lands on the cited page.
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
        const first = (await proxy.getPage(1)).getViewport({ scale: 1 })
        if (cancelled) return
        setState({
          document: {
            base: { height: first.height, width: first.width },
            pages: proxy.numPages,
            proxy
          },
          token: request.token
        })
        if (!request.reload) setPage(Math.min(requestedPage(request), proxy.numPages))
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

  // После загрузки — на страницу из ссылки. Отдельным эффектом: заготовки
  // страниц появляются в DOM только после того, как документ лёг в состояние.
  const landedToken = useRef(0)
  useEffect(() => {
    if (!document || !request || landedToken.current === request.token) return
    landedToken.current = request.token
    // Перечитанный файл (T74) остаётся на той странице, где его читали: её
    // держит эффект масштаба ниже.
    // Прокрутка ленты — работа с DOM; счётчик страниц ставится вместе с ней.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (!request.reload) scrollToPage(Math.min(requestedPage(request), document.pages))
  }, [document, request, scrollToPage])

  // Прежний документ pdf.js освобождается, когда его страницы уже сняты: при
  // живом обновлении (T74) файл перечитывается на каждую запись агента.
  useEffect(() => {
    const proxy = document?.proxy
    return () => {
      void proxy?.destroy?.()
    }
  }, [document])

  // Масштаб сменился — оставаться на той же странице.
  const pageNow = useRef(page)
  useEffect(() => {
    pageNow.current = page
  }, [page])
  useEffect(() => {
    if (document) scrollToPage(pageNow.current)
  }, [scale, document, scrollToPage])

  // Счётчик следует за прокруткой.
  const onScroll = (): void => {
    if (ignoreNextScroll.current) {
      ignoreNextScroll.current = false
      return
    }
    const scroller = scrollRef.current
    if (!scroller || !document) return
    const tops: number[] = []
    for (let number = 1; number <= document.pages; number += 1) {
      tops.push(pageElements.current.get(number)?.offsetTop ?? 0)
    }
    const at = pageAtOffset(tops, scroller.scrollTop + scroller.clientHeight / 3)
    if (at !== page) setPage(at)
  }

  // Ctrl+колесо — масштаб. Слушатель не пассивный: иначе `preventDefault` не
  // остановит масштаб всего окна, который Electron делает на тот же жест.
  const scaleNow = useRef(scale)
  useEffect(() => {
    scaleNow.current = scale
  }, [scale])
  useEffect(() => {
    if (!scroller) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom(nextZoomStep(scaleNow.current, event.deltaY < 0 ? 1 : -1))
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [scroller])

  const jumpTo = useCallback(
    (found: Match[], forQuery: string, from: number): void => {
      if (!found.length) {
        setCursor({ query: forQuery, at: 0 })
        return
      }
      const at = matchNearPage(found, from)
      setCursor({ query: forQuery, at })
      scrollToPage(found[at].page)
    },
    [scrollToPage]
  )

  const latest = useRef({ query, page })
  useEffect(() => {
    latest.current = { query, page }
  }, [query, page])

  // Текст достаётся ровно один раз на документ, при первом непустом запросе.
  useEffect(() => {
    if (!document || !request || !searching) return
    if (text?.token === request.token) return

    let cancelled = false
    void (async () => {
      const pages: SearchablePage[] = []
      for (let number = 1; number <= document.pages; number += 1) {
        const content = await document.proxy.getPage(number).then(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs page
          (loaded: any) => loaded.getTextContent()
        )
        if (cancelled) return
        const pieces: TextPiece[] = content.items
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs text item
          .filter((item: any) => typeof item.str === 'string')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs text item
          .map((item: any) => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            eol: Boolean(item.hasEOL)
          }))
        pages.push(toSearchable(number, pieces))
      }
      if (cancelled) return
      setText({ token: request.token, pages })
      const { query: asked, page: from } = latest.current
      jumpTo(findMatches(pages, asked), asked, from)
    })()

    return () => {
      cancelled = true
    }
  }, [document, request, searching, text?.token, jumpTo])

  const matches = useMemo<Match[]>(() => {
    if (!request || text?.token !== request.token) return []
    return findMatches(text.pages, query)
  }, [text, query, request])

  const current = cursor.query === query ? cursor.at : 0

  function goToMatch(at: number): void {
    if (!matches.length) return
    const next = (at + matches.length) % matches.length
    setCursor({ query, at: next })
    scrollToPage(matches[next].page)
  }

  // Подсветка по страницам: все совпадения, текущее — ярче.
  const highlightsByPage = useMemo(() => {
    const byPage = new Map<number, PageHighlight[]>()
    if (!text || !matches.length) return byPage
    matches.forEach((match, index) => {
      const source = text.pages.find((candidate) => candidate.page === match.page)
      if (!source) return
      const pieces = match.pieces.map((piece) => source.pieces[piece]).filter(Boolean)
      const list = byPage.get(match.page) ?? []
      list.push({ active: index === current, pieces })
      byPage.set(match.page, list)
    })
    return byPage
  }, [text, matches, current])

  const activeHighlight = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    activeHighlight.current?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [current, highlightsByPage])

  if (!request) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        {t('viewer.empty')}
      </div>
    )
  }

  const pageNumbers = document ? Array.from({ length: document.pages }, (_, i) => i + 1) : []

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader relPath={request.relPath} />

      <div className="border-border flex flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button
          aria-label={t('viewer.previous')}
          disabled={!document || page <= 1}
          onClick={() => scrollToPage(Math.max(1, page - 1))}
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
          disabled={!document || page >= (document?.pages ?? 1)}
          onClick={() => scrollToPage(Math.min(document?.pages ?? page, page + 1))}
          size="sm"
          variant="ghost"
        >
          →
        </Button>

        <span className="bg-border mx-1 h-4 w-px" />

        <Button
          aria-label={t('viewer.zoomOut')}
          disabled={!document}
          onClick={() => setZoom(nextZoomStep(zoom ?? 1, -1))}
          size="sm"
          variant="ghost"
        >
          −
        </Button>
        <Button
          className="min-w-14 text-xs"
          onClick={() => setZoom(null)}
          size="sm"
          title={t('viewer.zoomFit')}
          variant="ghost"
        >
          {zoom === null ? t('viewer.zoomFitShort') : t('viewer.zoomLabel', Math.round(zoom * 100))}
        </Button>
        <Button
          aria-label={t('viewer.zoomIn')}
          disabled={!document}
          onClick={() => setZoom(nextZoomStep(zoom ?? 1, 1))}
          size="sm"
          variant="ghost"
        >
          +
        </Button>

        <div className="ml-auto flex w-full items-center gap-1">
          <input
            aria-label={t('viewer.search')}
            className="border-border bg-background focus:border-ring min-w-0 flex-1 rounded border px-2 py-1 text-xs outline-none"
            disabled={!document}
            onChange={(event) => {
              const next = event.target.value
              setSearch({ key: documentKey, query: next })
              if (text?.token === request.token) jumpTo(findMatches(text.pages, next), next, page)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              goToMatch(event.shiftKey ? current - 1 : current + 1)
            }}
            placeholder={t('viewer.searchPlaceholder')}
            type="search"
            value={query}
          />
          <span className="text-muted-foreground min-w-20 text-center text-xs">
            {!searching
              ? ''
              : extracting
                ? t('viewer.searching')
                : matches.length
                  ? t('viewer.matchOf', current + 1, matches.length)
                  : t('viewer.noMatches')}
          </span>
          <Button
            aria-label={t('viewer.previousMatch')}
            disabled={!matches.length}
            onClick={() => goToMatch(current - 1)}
            size="sm"
            variant="ghost"
          >
            ↑
          </Button>
          <Button
            aria-label={t('viewer.nextMatch')}
            disabled={!matches.length}
            onClick={() => goToMatch(current + 1)}
            size="sm"
            variant="ghost"
          >
            ↓
          </Button>
        </div>
      </div>

      <div
        className="bg-muted/40 relative flex-1 overflow-auto p-3"
        data-testid="pdf-scroll"
        onScroll={onScroll}
        ref={attachScroller}
      >
        {loading ? (
          <div className="text-muted-foreground text-sm">{t('viewer.opening')}</div>
        ) : null}
        {error ? (
          <div className="text-destructive space-y-2 text-sm">
            <div>{t('viewer.failed', error)}</div>
            <div className="text-muted-foreground">
              {request.sourceId ? t('viewer.sourceLine', request.sourceId) : ''}
              {t('viewer.pathLine', request.relPath)}
            </div>
          </div>
        ) : null}
        {document ? (
          <div className="flex w-fit min-w-full flex-col" style={{ gap: PAGE_GAP }}>
            {pageNumbers.map((number) => (
              <PdfPage
                activeRef={activeHighlight}
                base={document.base}
                highlights={highlightsByPage.get(number) ?? []}
                key={`${request.token}-${number}`}
                number={number}
                proxy={document.proxy}
                scale={scale}
                setElement={setPageElement}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
