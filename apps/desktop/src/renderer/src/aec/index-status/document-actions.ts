// Действия по документу (задача 3L.6, SPEC UR46): «Индексировать», «Продолжить
// распознавание сканов», «Убрать из индекса» — для любого файла, в описи на
// странице «Индекс» и в меню деревьев. Что предложить, решает состояние файла в
// описи; исполняет главный процесс (`indexDocument` / `excludeDocument`, 3L.5).

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'

import type { GraphScopeKind, InventoryFile } from '../../../../shared/ipc'

export type DocumentAction = 'continueScans' | 'exclude' | 'index'

/** Ключи запросов — под префиксом страницы «Индекс»: она перечитывает его
 *  после каждого прогона, и деревья получают то же самое. */
export const INVENTORY_KEY = ['aec', 'index-status', 'inventory'] as const
export const EXCLUDED_KEY = ['aec', 'index-status', 'excluded'] as const

/** Страницы-сканы, которые ждут распознавания. Сбойные прогон на файл не
 *  повторяет — для них «продолжить» ничего бы не сделало. */
export function waitingScans(file: InventoryFile): number {
  return file.scans ? file.scans.total - file.scans.done - file.scans.failed : 0
}

/** Что предложить файлу. `file` — его строка описи, `null` — в описи его нет
 *  (ещё не сканирован); `excluded` — человек убрал его из индекса. */
export function documentActions(file: InventoryFile | null, excluded: boolean): DocumentAction[] {
  if (excluded || file === null) return ['index']
  // Формат не читается — индексировать нечего, а убрать из описи можно.
  if (file.index === 'skipped') return ['exclude']
  return [waitingScans(file) > 0 ? 'continueScans' : 'index', 'exclude']
}

export interface DocumentTarget {
  kind: GraphScopeKind
  rel: string
  sourceId: string
}

/** Выполнить действие. Возвращает отказ словами или `null`; подтверждение
 *  «Убрать» спрашивает вызывающий — у него своё окно (`useConfirm`, D-204). */
export async function runDocumentAction(
  action: DocumentAction,
  target: DocumentTarget
): Promise<null | string> {
  const result =
    action === 'exclude'
      ? await window.aecpilot.excludeDocument(target)
      : await window.aecpilot.indexDocument(target)
  return result.ok ? null : result.error
}

export interface DocumentIndex {
  /** Строка описи файла, если она есть. */
  file(sourceId: string, rel: string): InventoryFile | null
  /** Убран ли файл человеком — сам или вместе с папкой. */
  excluded(sourceId: string, rel: string): boolean
  /** Перечитать опись и список убранного (после действия). */
  refresh(): Promise<void>
}

/** Опись и список убранного для деревьев. Перечитываются после каждого
 *  прогона индекса и графа — значки не должны отставать от страницы «Индекс». */
export function useDocumentIndex(enabled = true): DocumentIndex {
  const queryClient = useQueryClient()
  const inventory = useQuery({
    enabled,
    queryKey: INVENTORY_KEY,
    queryFn: () => window.aecpilot.getIndexInventory()
  })
  const excludedList = useQuery({
    enabled,
    queryKey: EXCLUDED_KEY,
    queryFn: () => window.aecpilot.listIndexExclude()
  })

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] }),
    [queryClient]
  )

  useEffect(() => {
    if (!enabled) return undefined
    const offIngest = window.aecpilot.onIngestState((next) => {
      if (!next.running) void refresh()
    })
    const offGraph = window.aecpilot.onGraphAddState((next) => {
      if (!next.running) void refresh()
    })
    return () => {
      offIngest()
      offGraph()
    }
  }, [enabled, refresh])

  return useMemo(() => {
    const files = new Map<string, InventoryFile>()
    if (inventory.data?.ok) {
      for (const file of inventory.data.inventory.files) {
        files.set(`${file.source_id}/${file.rel_path}`, file)
      }
    }
    const excluded = excludedList.data ?? []
    return {
      excluded: (sourceId, rel) => {
        const place = `${sourceId}/${rel}`
        return excluded.some((entry) => place === entry || place.startsWith(`${entry}/`))
      },
      file: (sourceId, rel) => files.get(`${sourceId}/${rel}`) ?? null,
      refresh
    }
  }, [inventory.data, excludedList.data, refresh])
}
