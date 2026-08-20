// `::aec-table` — ведомость таблицей прямо в ответе (задача 3.4б, SPEC UR28).
//
// Данные не в директиве, а в файле: их разбор отдаёт плоские строки атрибутов до
// 1024 знаков, и настоящая ведомость туда не влезет. Блок ПОКАЗЫВАЕТ файл,
// который агент положил в проект, — один источник правды на диске, живой вид на
// него в ленте, и кнопка «открыть целиком» ведёт в тот же просмотрщик, что и
// цитата.
//
// Читает главный процесс: `readDocument` для CSV/TSV и `readSheets` для XLSX
// (exceljs — библиотека Node). Путь резолвится там же и теми же проверками, что
// и любой путь из окна: атрибут написан агентом, то есть враждебен (SPEC C9).

import { useQuery } from '@tanstack/react-query'

import { parseCsv } from '../viewers/csv-pure'
import { decodeText } from '../viewers/text-decode'
import { openDocument } from '../viewers/viewer-store'
import { useAecT } from '../../shared/i18n'

import { readTableBlock, tableKindOf, tablePreview, type DirectiveAttrs } from './blocks-pure'

async function loadRows(file: string, sourceId: string): Promise<string[][]> {
  const source = sourceId || undefined

  if (tableKindOf(file) === 'sheet') {
    const result = await window.aecpilot.readSheets(file, source)
    if (!result.ok) throw new Error(result.error)
    // Первый лист: директива называет файл, а не лист. Ведомость, разложенная
    // по листам, — это уже просмотрщик, и туда ведёт кнопка ниже.
    return result.sheets[0]?.rows ?? []
  }

  const result = await window.aecpilot.readDocument(file, source)
  if (!result.ok) throw new Error(result.error)
  return parseCsv(decodeText(result.bytes).text)
}

export function TableBlockView({ attrs }: { attrs: DirectiveAttrs }): React.JSX.Element {
  const t = useAecT()
  const block = readTableBlock(attrs)
  const kind = tableKindOf(block.file)

  const { data, error, isLoading } = useQuery({
    enabled: block.file !== '' && kind !== 'unsupported',
    queryKey: ['aec', 'table-block', block.sourceId, block.file],
    queryFn: () => loadRows(block.file, block.sourceId)
  })

  const head = (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate font-semibold text-(--ui-text-primary)">
        {block.title || block.file || t('blocks.table')}
      </span>
      {block.file && (
        <button
          className="shrink-0 text-(--ui-text-secondary) underline decoration-dotted underline-offset-2 transition-colors hover:text-(--ui-text-primary)"
          onClick={() =>
            openDocument({
              locator: {},
              relPath: block.file,
              sourceId: block.sourceId || undefined
            })
          }
          type="button"
        >
          {t('blocks.openWhole')}
        </button>
      )}
    </div>
  )

  const frame = (body: React.ReactNode) => (
    <div className="my-1.5 flex flex-col gap-2 overflow-hidden rounded-[6px] border border-(--ui-stroke-secondary) bg-(--ui-bg-quaternary) p-2 text-xs">
      {head}
      {body}
    </div>
  )

  // Каждый неудачный случай называется вслух: пустая рамка в ленте читается как
  // поломка приложения, хотя это чаще всего опечатка агента в пути.
  if (block.file === '')
    return frame(<p className="text-(--ui-text-tertiary)">{t('blocks.noFile')}</p>)
  if (kind === 'unsupported') {
    return frame(<p className="text-(--ui-text-tertiary)">{t('blocks.tableUnsupported')}</p>)
  }
  if (isLoading) return frame(<p className="text-(--ui-text-secondary)">{t('blocks.loading')}</p>)
  if (error) {
    return frame(
      <p className="text-(--ui-text-secondary)">
        {t('blocks.tableFailed', error instanceof Error ? error.message : String(error))}
      </p>
    )
  }

  const { head: columns, body, hidden } = tablePreview(data ?? [], block.limit)

  if (columns.length === 0) {
    return frame(<p className="text-(--ui-text-tertiary)">{t('blocks.tableEmpty')}</p>)
  }

  return frame(
    <div className="flex flex-col gap-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {columns.map((cell, index) => (
                <th
                  className="border-b border-(--ui-stroke-secondary) px-1.5 py-1 font-semibold text-(--ui-text-secondary)"
                  key={index}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((_, cellIndex) => (
                  <td
                    className="border-b border-(--ui-stroke-secondary)/50 px-1.5 py-1 text-(--ui-text-primary)"
                    key={cellIndex}
                  >
                    {row[cellIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hidden > 0 && <p className="text-(--ui-text-tertiary)">{t('blocks.tableHidden', hidden)}</p>}
    </div>
  )
}
