// Таблица GFM, набранная руками (чек-лист, блок 20, шаг 6; D-94).
//
// Редактор — WYSIWYG: `| а | б |` и строка из дефисов под ней оставались двумя
// абзацами, потому что Enter здесь заводит новый абзац, а не строку разметки,
// и на диске между ними ложилась пустая строка — таблицей это не становилось
// никогда. Человек же набирает разметку так, как привык в любом .md, и ждёт
// таблицу.
//
// Правило: как только человек ушёл со строки-разделителя Enter'ом, абзац-шапка
// и абзац-разделитель разбираются ИХ ЖЕ парсером markdown и заменяются узлом
// таблицы. Строка `| … |`, набранная сразу под таблицей, тем же путём
// становится её строкой. Смотрим только на абзацы, которых коснулась правка:
// то, что уже лежало в файле, редактор не перестраивает — вики обещает не
// переписывать чужую разметку (docs/history/specs/wiki.md). Узел таблицы сериализуется
// обратно в ту же GFM-запись, которую человек и набрал.

import { parserCtx, serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

import { cellsOf, isBlankRow, isDelimiterRow, isTableRow } from './gfm-table-pure'

const KEY = new PluginKey('aec-gfm-table-input')

/** Блоки верхнего уровня с их позициями: таблицы живут только там. Внутри
 *  списков и цитат разметка не трогается — там она и в GFM не таблица. */
function topLevel(doc: Node): { node: Node; pos: number }[] {
  const blocks: { node: Node; pos: number }[] = []
  let pos = 0
  doc.forEach((node) => {
    blocks.push({ node, pos })
    pos += node.nodeSize
  })
  return blocks
}

/** Разобрать разметку их парсером и поставить таблицу на место блоков
 *  `[from, to)`. Если разбор дал не одну таблицу — ничего не менять: лучше
 *  оставить абзацы, чем испортить документ. */
function replaceWithTable(
  ctx: Ctx,
  state: EditorState,
  from: number,
  to: number,
  markdown: string
): Transaction | null {
  const parsed = ctx.get(parserCtx)(markdown)
  const table = parsed.childCount === 1 ? parsed.firstChild : null
  if (!table || table.type.name !== 'table') return null
  return state.tr.replaceWith(from, to, table)
}

/** Отрезки документа, которых коснулись правки, — в координатах итогового
 *  документа. Позиции каждого шага доводятся через шаги, что шли после него. */
function touched(transactions: readonly Transaction[]): [number, number][] {
  const ranges: [number, number][] = []
  for (const tr of transactions) {
    tr.mapping.maps.forEach((map, index) => {
      const rest = tr.mapping.slice(index + 1)
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)])
      })
    })
  }
  return ranges
}

function columnsOfTable(table: Node): number {
  return table.firstChild?.childCount ?? 0
}

export const gfmTableInputPlugin = $prose(
  (ctx) =>
    new Plugin({
      key: KEY,
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some((tr) => tr.docChanged)) return null
        const blocks = topLevel(state.doc)
        const cursor = state.selection.from
        const edited = touched(transactions)

        for (let at = 1; at < blocks.length; at += 1) {
          const prev = blocks[at - 1]
          const cur = blocks[at]
          if (cur.node.type.name !== 'paragraph') continue
          const end = cur.pos + cur.node.nodeSize
          if (!edited.some(([from, to]) => from <= end && to >= cur.pos)) continue
          // Пока курсор стоит в этой строке, человек её ещё набирает: собирать
          // таблицу на полуслове значило бы ронять очередную черту в ячейку.
          if (cursor >= cur.pos && cursor <= end) continue
          const line = cur.node.textContent

          if (prev.node.type.name === 'paragraph') {
            const header = prev.node.textContent
            if (
              isDelimiterRow(line) &&
              isTableRow(header) &&
              cellsOf(header).length === cellsOf(line).length
            ) {
              return replaceWithTable(ctx, state, prev.pos, end, `${header}\n${line}`)
            }
            continue
          }

          if (
            prev.node.type.name === 'table' &&
            isTableRow(line) &&
            cellsOf(line).length === columnsOfTable(prev.node)
          ) {
            // Сериализатор ждёт документ, а не узел: заворачиваем таблицу в
            // пустой документ той же схемы.
            // Пустой ряд под шапкой (см. `isBlankRow`) уступает место набранному.
            const doc = state.schema.topNodeType.create(null, [prev.node])
            const table = ctx
              .get(serializerCtx)(doc)
              .split('\n')
              .filter((row) => row.trim() && !isBlankRow(row))
              .join('\n')
            return replaceWithTable(ctx, state, prev.pos, end, `${table}\n${line}`)
          }
        }
        return null
      }
    })
)
