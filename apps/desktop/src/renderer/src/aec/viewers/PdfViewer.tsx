// The PDF viewer a citation opens (task 2.14; поиск и зум — задача 4.1).
//
// What this must get right above everything else is the one thing AC1 measures:
// the page a citation points at is the page that appears. Задача 4.1 добавила
// то, без чего просмотрщик остаётся демонстрационным: масштаб (лист чертежа
// нечитаем «по ширине») и поиск по тексту (в ТУ на сорок страниц ссылка
// приводит на страницу, а искомое место надо ещё найти глазами).
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
import { ViewerHeader } from './ViewerHeader'
import { $openDocument, requestedPage } from './viewer-store'

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

/** Ступени масштаба. Ряд, а не свободное число: кнопка «+» должна давать
 *  предсказуемый шаг, а 100% и 200% — попадать точно. */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

/** `null` — по ширине панели; так документ открывается по умолчанию. */
type Zoom = number | null

type Rect = { left: number; top: number; width: number; height: number }

/** Прямоугольник куска текста в координатах холста. Точен при повороте 0 и
 *  достаточен при любом другом: подсветка обводит слово, а не измеряет его. */
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

export function PdfViewer(): React.JSX.Element {
  const t = useAecT()
  const request = useStore($openDocument)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<ViewerState>({ token: 0 })
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState<Zoom>(null)

  // Поиск. Текст вытаскивается один раз на документ и только когда о нём
  // попросили: getTextContent по каждой странице стоит заметно, а большинство
  // открытий просмотрщика — «посмотреть на место из ссылки», без поиска.
  //
  // Запрос и курсор привязаны к документу и к запросу СВОИМ полем, а не
  // сбрасываются эффектом на смену документа: чужой запрос в строке — это
  // «совпадений нет» там, где искать никто не просил, а сброс через эффект даёт
  // лишний проход рендера на каждое открытие ссылки.
  const [search, setSearch] = useState<{ key: string; query: string }>({ key: '', query: '' })
  const [cursor, setCursor] = useState<{ query: string; at: number }>({ query: '', at: 0 })
  const [text, setText] = useState<{ token: number; pages: SearchablePage[] } | null>(null)

  // Вьюпорт последней отрисовки — по нему подсветка переводит координаты PDF в
  // пиксели холста. Держится в состоянии, потому что подсветка рисуется в том
  // же проходе, что и всё остальное.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdfjs viewport
  const [viewport, setViewport] = useState<any>(null)

  const settled = request !== null && state.token === request.token
  const document = settled ? state.document : undefined
  const error = settled ? state.error : undefined
  const loading = request !== null && !settled

  const documentKey = request ? `${request.sourceId ?? ''} ${request.relPath}` : ''
  const query = search.key === documentKey ? search.query : ''
  const searching = query.trim().length >= MIN_QUERY
  // «Достаём текст» — это не отдельный флаг, а то же самое, что «ищем, но
  // текста этого документа ещё нет».
  const extracting = searching && text?.token !== request?.token

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

  // Draw the current page. По умолчанию — по ширине панели: инженер читает лист
  // чертежа, и фиксированный масштаб либо режет его, либо ужимает текст до
  // нечитаемого. Явный масштаб отменяет подгонку.
  useEffect(() => {
    if (!document || !canvasRef.current) return

    let cancelled = false
    void (async () => {
      const rendered = await document.proxy.getPage(page)
      if (cancelled) return
      const canvas = canvasRef.current
      if (!canvas) return
      const available = canvas.parentElement?.parentElement?.clientWidth ?? 800
      const base = rendered.getViewport({ scale: 1 })
      const scale = zoom ?? Math.max(0.2, (available - 24) / base.width)
      const next = rendered.getViewport({ scale })
      canvas.width = Math.floor(next.width)
      canvas.height = Math.floor(next.height)
      const context = canvas.getContext('2d')
      if (!context) return
      await rendered.render({ canvas, canvasContext: context, viewport: next }).promise
      if (cancelled) return
      setViewport(next)
    })()

    return () => {
      cancelled = true
    }
  }, [document, page, zoom])

  /** Встать на ближайшее совпадение вперёд от страницы `from`. Ближайшее, а не
   *  первое в документе: читатель ищет то, что у него перед глазами, и прыжок
   *  на первую страницу он воспримет как промах поиска.
   *
   *  Страница передаётся аргументом, а не берётся из состояния: иначе разбор
   *  текста перезапускался бы на каждое перелистывание. */
  const jumpTo = useCallback((found: Match[], forQuery: string, from: number): void => {
    if (!found.length) {
      setCursor({ query: forQuery, at: 0 })
      return
    }
    const at = matchNearPage(found, from)
    setCursor({ query: forQuery, at })
    setPage(found[at].page)
  }, [])

  // Запрос и страница на момент КОНЦА разбора, а не его начала. В зависимости
  // эффекта их класть нельзя: разбор сорокастраничного документа перезапускался
  // бы на каждую букву запроса и на каждое перелистывание.
  const latest = useRef({ query, page })
  useEffect(() => {
    latest.current = { query, page }
  }, [query, page])

  // Текст достаётся ровно один раз на документ, при первом непустом запросе.
  // Прыжок на найденное делается здесь же, в колбэке: для первого запроса это
  // единственный момент, когда совпадения впервые становятся известны.
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
    setPage(matches[next].page)
  }

  // Подсветка: все совпадения на открытой странице, текущее — ярче.
  const highlights = useMemo<{ rect: Rect; active: boolean }[]>(() => {
    if (!viewport || !text || !matches.length) return []
    const source = text.pages.find((candidate) => candidate.page === page)
    if (!source) return []

    return matches
      .map((match, index) => ({ match, index }))
      .filter((entry) => entry.match.page === page)
      .flatMap((entry) =>
        entry.match.pieces
          .map((piece) => source.pieces[piece])
          .filter(Boolean)
          .map((piece) => ({ rect: pieceRect(piece, viewport), active: entry.index === current }))
      )
  }, [viewport, text, matches, page, current])

  const activeHighlight = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    activeHighlight.current?.scrollIntoView({ block: 'center', inline: 'center' })
  }, [current, page, viewport])

  if (!request) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
        {t('viewer.empty')}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Имя файла — в общей шапке: полоса вкладок появляется только со второго
          документа, и без шапки открытый в одиночку файл оставался бы
          безымянным. */}
      <ViewerHeader relPath={request.relPath} />

      <div className="border-border flex flex-wrap items-center gap-1 border-b px-3 py-2">
        <Button
          aria-label={t('viewer.previous')}
          disabled={!document || page <= 1}
          onClick={() => setPage((at) => Math.max(1, at - 1))}
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
          onClick={() => setPage((at) => Math.min(document?.pages ?? at, at + 1))}
          size="sm"
          variant="ghost"
        >
          →
        </Button>

        <span className="bg-border mx-1 h-4 w-px" />

        <Button
          aria-label={t('viewer.zoomOut')}
          disabled={!document}
          onClick={() =>
            setZoom((at) => {
              const from = at ?? 1
              return [...ZOOM_STEPS].reverse().find((step) => step < from - 0.001) ?? ZOOM_STEPS[0]
            })
          }
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
          onClick={() =>
            setZoom((at) => {
              const from = at ?? 1
              return (
                ZOOM_STEPS.find((step) => step > from + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
              )
            })
          }
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
              // Текст этого документа уже разобран — значит совпадения нового
              // запроса известны прямо сейчас, и прыжок делается здесь, а не
              // эффектом на изменение состояния.
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

      <div className="flex-1 overflow-auto p-3">
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
        <div className="relative mx-auto w-fit">
          <canvas className="block" ref={canvasRef} />
          {highlights.map((highlight, index) => (
            <div
              className={
                highlight.active
                  ? 'pointer-events-none absolute bg-amber-400/60'
                  : 'pointer-events-none absolute bg-amber-300/30'
              }
              key={index}
              ref={highlight.active ? activeHighlight : undefined}
              style={highlight.rect}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
