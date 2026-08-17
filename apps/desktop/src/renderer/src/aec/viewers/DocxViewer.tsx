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
// принципиально, а круговорот через HTML теряет оформление (PLAN §зависимости).

import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { useAecT } from '../../shared/i18n'

import { headingMatches } from './locator-pure'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument } from './viewer-store'

type State = { error?: string; ready: boolean; token: number }

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
        if (request.locator.heading && bodyRef.current) {
          scrollToHeading(bodyRef.current, request.locator.heading)
        }
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

      <div className="min-h-0 flex-1 overflow-auto">
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
        <div className="bg-white text-black" ref={bodyRef} />
      </div>
    </div>
  )
}
