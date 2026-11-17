// Просмотр DOCX (задача 4.2).
//
// Работу делает docx-preview: он разбирает документ и рисует его в наш узел
// вместе со своими стилями. Своего рендера здесь нет и быть не должно — формат
// накапливался тридцать лет, и повторять его разбор ради просмотра бессмысленно.
//
// Документ рисуется на белом листе при любой теме приложения. Это не недосмотр:
// лист — это лист, и перекрашивать чужой документ в тёмное значит показывать
// человеку не то, что он получит на печати и увидит у смежника.
//
// Правки нет и не будет из этого просмотрщика: docx-preview обратно не пишет
// принципиально, а круговорот через HTML теряет оформление (docs/plan-details.md §зависимости).
//
// Задача T76 (UR55, замечание владельца 5): лист по умолчанию вписан в ширину
// панели, Ctrl+колесо меняет масштаб ступенями, щелчок по проценту возвращает
// «по ширине». Масштаб — CSS `zoom` на узле документа: docx-preview рисует
// страницы фиксированной ширины в пунктах, и перерисовывать документ ради
// масштаба незачем.

import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'

import { useAecT } from '../../shared/i18n'

import { headingMatches } from './locator-pure'
import { nextZoomStep } from './pdf-scroll-pure'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument } from './viewer-store'

type State = { error?: string; ready: boolean; token: number }

/** Ширина листа при масштабе 1: самая широкая страница документа. */
function naturalWidth(root: HTMLElement): number {
  // Мерить при масштабе 1: под `zoom` ширины отдаются уже умноженными.
  const previous = root.style.zoom
  root.style.zoom = '1'
  const pages = root.querySelectorAll<HTMLElement>('section.docx')
  let widest = 0
  for (const page of pages) widest = Math.max(widest, page.offsetWidth)
  const width = widest || root.scrollWidth || 800
  root.style.zoom = previous
  return width
}

/** Прокрутка к заголовку из ссылки (задача 4.4).
 *
 *  Ищется среди всех абзацев, а не среди `h1`–`h6`: docx-preview рисует
 *  заголовок Word обычным абзацем со своим классом, и разметочных заголовков в
 *  выводе нет вовсе. Не нашли — не прокручиваем: документ открыт с начала, и
 *  это честнее, чем встать на случайный абзац. */
function scrollToHeading(root: HTMLElement, heading: string): void {
  const candidates = root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, td')

  for (const candidate of candidates) {
    if (!headingMatches(candidate.textContent ?? '', heading)) continue
    candidate.scrollIntoView({ block: 'center' })
    // Подсветка держится, пока открыт документ: человек пришёл сюда по ссылке
    // и должен видеть, на что именно она указывала.
    candidate.style.backgroundColor = 'rgb(251 191 36 / 0.35)'
    return
  }
}

export function DocxViewer(): React.JSX.Element | null {
  const t = useAecT()
  const request = useStore($openDocument)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const styleRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<State>({ ready: false, token: 0 })
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** `null` — по ширине панели. */
  const [zoom, setZoom] = useState<number | null>(null)
  const [paneWidth, setPaneWidth] = useState(800)
  const [pageWidth, setPageWidth] = useState(0)

  const scale = zoom ?? (pageWidth ? Math.max(0.25, (paneWidth - 24) / pageWidth) : 1)
  /** Раздел, к которому ещё надо прокрутить открытый документ (цитата `h:`). */
  const pendingHeading = useRef<string | null>(null)
  const scaleNow = useRef(scale)
  useEffect(() => {
    scaleNow.current = scale
  }, [scale])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    setPaneWidth(scroller.clientWidth || 800)
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return
      event.preventDefault()
      setZoom(nextZoomStep(scaleNow.current, event.deltaY < 0 ? 1 : -1))
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => setPaneWidth(scroller.clientWidth || 800))
    observer?.observe(scroller)
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      observer?.disconnect()
    }
  }, [])

  useEffect(() => {
    const heading = pendingHeading.current
    if (!state.ready || !heading || !bodyRef.current) return
    scrollToHeading(bodyRef.current, heading)
    // Масштаб выбрал человек — дальше документ листает он сам.
    if (zoom !== null) pendingHeading.current = null
  }, [scale, state, zoom])

  useEffect(() => {
    if (!request) return

    let cancelled = false
    void (async () => {
      const result = await window.aecpilot.readDocument(request.relPath, request.sourceId)
      if (cancelled) return
      if (!result.ok) {
        setState({ error: result.error, ready: false, token: request.token })
        return
      }

      try {
        // Грузится по первому DOCX: пакет тянет за собой jszip, и сессия, в
        // которой ни одного DOCX не открыли, платить за это не должна.
        const { renderAsync } = await import('docx-preview')
        if (cancelled || !bodyRef.current) return
        bodyRef.current.replaceChildren()
        await renderAsync(result.bytes, bodyRef.current, styleRef.current ?? undefined, {
          // Страницы разделены так же, как их видит Word: инженер ссылается на
          // номер страницы, и слитная простыня сделала бы ссылку бесполезной.
          breakPages: true,
          className: 'docx',
          inWrapper: true
        })
        if (cancelled) return
        if (bodyRef.current) setPageWidth(naturalWidth(bodyRef.current))
        // К разделу — после того, как масштаб «по ширине» встал (эффект ниже):
        // прокрутка до смены масштаба уводила заголовок из кадра.
        pendingHeading.current = request.locator.heading ?? null
        // Новый запрос открывает документ с начала: панель прокрутки живёт
        // дольше документа, и без этого он открывался там, где читали прежний.
        if (scrollRef.current) scrollRef.current.scrollTop = 0
        setState({ ready: true, token: request.token })
      } catch (cause: unknown) {
        if (cancelled) return
        setState({
          error: cause instanceof Error ? cause.message : String(cause),
          ready: false,
          token: request.token
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [request])

  if (!request) return null

  const settled = state.token === request.token
  const error = settled ? state.error : undefined

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader relPath={request.relPath} />

      <div className="border-border flex items-center gap-1 border-b px-3 py-1">
        <Button
          aria-label={t('viewer.zoomOut')}
          onClick={() => setZoom(nextZoomStep(scale, -1))}
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
          onClick={() => setZoom(nextZoomStep(scale, 1))}
          size="sm"
          variant="ghost"
        >
          +
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-testid="docx-scroll" ref={scrollRef}>
        {!settled ? (
          <div className="text-muted-foreground p-3 text-sm">{t('viewer.opening')}</div>
        ) : null}
        {error ? (
          <div className="text-destructive space-y-2 p-3 text-sm">
            <div>{t('viewer.failed', error)}</div>
            <div className="text-muted-foreground break-all">{request.relPath}</div>
          </div>
        ) : null}
        {/* Их стили приезжают в отдельный узел, чтобы не смешиваться с
            разметкой документа и уезжать вместе с ним при смене файла. */}
        <div hidden ref={styleRef} />
        <div
          className="bg-white text-black"
          data-zoom={scale.toFixed(3)}
          ref={bodyRef}
          style={{ zoom: scale }}
        />
      </div>
    </div>
  )
}
