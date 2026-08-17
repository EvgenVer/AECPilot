// Просмотр XLSX и CSV (задача 4.3).
//
// Сетка наша, разбор чужой. XLSX разбирает exceljs в главном процессе (там он
// у себя дома — это библиотека Node), CSV разбирается здесь же: у него три
// правила, и звать ради них кого-то со стороны дороже, чем написать.
//
// Строки виртуализованы: ведомость на двадцать тысяч строк это норма, а
// двадцать тысяч узлов DOM — нет. Столбцы не виртуализуются: их у ведомости
// десятки, а не тысячи, и лишний слой тут стоил бы больше, чем экономил.
//
// Только чтение. Источники read-only (SPEC UR2, AC6), а редактор ячейки —
// отдельный вопрос объёма (PLAN §зависимости).

import { useStore } from '@nanostores/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { SheetData } from '../../../../shared/ipc'

import { parseCsv } from './csv-pure'
import { findSheet, isCited, parseA1Range, type CellRange } from './locator-pure'
import { decodeText } from './text-decode'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument } from './viewer-store'

type State = { error?: string; sheets?: SheetData[]; token: number }

const CSV = /\.csv$/i

/** Ширина колонки с номерами строк. Фиксированная: номер строки в ведомости —
 *  это адрес, по которому спорят, и он не должен прыгать при прокрутке. */
const GUTTER = '3.5rem'

const ROW_HEIGHT = 24

export function SheetViewer(): React.JSX.Element | null {
  const t = useAecT()
  const request = useStore($openDocument)
  const [state, setState] = useState<State>({ token: 0 })
  const [active, setActive] = useState(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!request) return

    let cancelled = false
    void (async () => {
      if (CSV.test(request.relPath)) {
        const result = await window.aecpilot.readDocument(request.relPath, request.sourceId)
        if (cancelled) return
        setState(
          result.ok
            ? {
                sheets: [
                  {
                    name: request.relPath.split('/').pop() ?? '',
                    rows: parseCsv(decodeText(result.bytes).text),
                    totalRows: 0,
                    truncated: false
                  }
                ],
                token: request.token
              }
            : { error: result.error, token: request.token }
        )
        return
      }

      const result = await window.aecpilot.readSheets(request.relPath, request.sourceId)
      if (cancelled) return
      setState(
        result.ok
          ? { sheets: result.sheets, token: request.token }
          : { error: result.error, token: request.token }
      )
      // Задача 4.4: лист из ссылки выбирается здесь же, где листы впервые
      // становятся известны. Нет такого листа — остаётся первый: открыть чужой
      // лист хуже, чем открыть книгу с начала.
      if (result.ok) {
        const at = findSheet(
          result.sheets.map((sheet) => sheet.name),
          request.locator.sheet
        )
        setActive(at ?? 0)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [request])

  const settled = request !== null && state.token === request.token
  const sheets = settled ? state.sheets : undefined
  const sheet = sheets?.[Math.min(active, sheets.length - 1)]
  const rows = sheet?.rows ?? []

  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    overscan: 12
  })

  // Задача 4.4. Выделение — только на том листе, который ссылка и называет:
  // диапазон C5:D6 на соседнем листе адресует другие данные.
  const highlight: CellRange | null =
    sheet && request && findSheet([sheet.name], request.locator.sheet) !== null
      ? parseA1Range(request.locator.range ?? '')
      : null

  // Прокрутка к названному месту. `token` в зависимостях — тот же приём, что и
  // в PDF: повторный клик по той же ссылке должен вернуть к ней, а не оставить
  // читателя там, куда он успел уехать.
  const scrollTo = highlight?.top
  const token = request?.token
  useEffect(() => {
    if (scrollTo === undefined) return
    virtualizer.scrollToIndex(scrollTo - 1, { align: 'center' })
  }, [scrollTo, token, virtualizer])

  if (!request) return null

  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0)

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader relPath={request.relPath}>
        {sheet?.truncated ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {t('viewer.sheetTruncated', rows.length, sheet.totalRows)}
          </span>
        ) : null}
      </ViewerHeader>

      {/* Листы книги. Одна ведомость — одна вкладка, и полосы нет. */}
      {sheets && sheets.length > 1 ? (
        <div className="border-border flex gap-0.5 overflow-x-auto border-b px-1 py-1">
          {sheets.map((one, at) => (
            <Button
              className="shrink-0 text-xs"
              key={one.name}
              onClick={() => setActive(at)}
              size="sm"
              variant={at === active ? 'secondary' : 'ghost'}
            >
              {one.name}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto" ref={scrollRef}>
        {!settled ? (
          <div className="text-muted-foreground p-3 text-sm">{t('viewer.opening')}</div>
        ) : state.error ? (
          <div className="text-destructive space-y-2 p-3 text-sm">
            <div>{t('viewer.failed', state.error)}</div>
            <div className="text-muted-foreground break-all">{request.relPath}</div>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-muted-foreground p-3 text-sm">{t('viewer.sheetEmpty')}</div>
        ) : (
          <div className="relative w-max min-w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                className="absolute flex w-full items-stretch"
                key={item.key}
                style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              >
                <div
                  className="bg-muted/40 text-muted-foreground border-border shrink-0 border-r border-b px-1 text-right font-mono text-[11px] leading-6"
                  style={{ width: GUTTER }}
                >
                  {item.index + 1}
                </div>
                {Array.from({ length: columns }, (_, column) => {
                  const cited = isCited(item.index, column, highlight)

                  return (
                    <div
                      className={
                        cited
                          ? 'w-40 shrink-0 truncate border-r border-b border-amber-500/60 bg-amber-400/30 px-1.5 text-xs leading-6'
                          : 'border-border w-40 shrink-0 truncate border-r border-b px-1.5 text-xs leading-6'
                      }
                      key={column}
                      title={rows[item.index][column] ?? ''}
                    >
                      {rows[item.index][column] ?? ''}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
