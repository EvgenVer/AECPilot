// Ссылки `[[…]]` в редакторе: подсветка и переход (задача 4.6).
//
// Украшениями (decorations), а не узлом схемы. Узел пришлось бы переводить
// обратно в markdown при каждом сохранении, и любая неточность этого перевода
// означала бы, что редактор молча переписал файл человека — ровно то, чего
// вики обещает не делать (specs/wiki.md, «Ручная правка сохраняется»).
// Украшение живёт поверх текста: документ от него не меняется ни на символ,
// а `[[…]]` в файле остаётся тем же `[[…]]`.

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node } from '@milkdown/kit/prose/model'

import { findWikiLinks, linkAt } from './wikilink-pure'

const KEY = new PluginKey('aec-wikilink')

/** Утилитами Tailwind, а не своим правилом в CSS: единственный стилевой файл
 *  здесь — вендоренный `donor/styles.css`, а его править нельзя (AGENTS §14).
 *  Заодно цвет сам следует теме. */
const LINK_CLASS = 'text-primary cursor-pointer underline decoration-dotted underline-offset-2'

function decorate(doc: Node): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, position) => {
    if (!node.isTextblock) return true
    for (const link of findWikiLinks(node.textContent)) {
      // +1 — за открывающую позицию самого блока.
      decorations.push(
        Decoration.inline(position + 1 + link.start, position + 1 + link.end, {
          class: LINK_CLASS,
          'data-wikilink': link.target,
          title: link.target
        })
      )
    }
    return true
  })

  return DecorationSet.create(doc, decorations)
}

/** Текст блока, внутри которого стоит позиция, и смещение внутри него. */
function blockAt(state: EditorState, position: number): { offset: number; text: string } | null {
  const resolved = state.doc.resolve(position)
  const block = resolved.parent
  if (!block.isTextblock) return null
  return { offset: position - resolved.start(), text: block.textContent }
}

/**
 * @param open — что делать с целью ссылки. Переход наружу (открыть страницу,
 * а если её нет — создать) живёт в редакторе: плагин знает только текст.
 */
export function wikilinkPlugin(open: (target: string) => void) {
  return $prose(
    () =>
      new Plugin({
        key: KEY,
        props: {
          decorations: (state) => KEY.getState(state) as DecorationSet,
          handleClick: (view, position) => {
            const block = blockAt(view.state, position)
            if (!block) return false
            const link = linkAt(block.text, block.offset)
            if (!link) return false
            open(link.target)
            // Клик съеден: иначе рядом с переходом встал бы ещё и курсор.
            return true
          }
        },
        state: {
          init: (_config, state: EditorState) => decorate(state.doc),
          apply: (tr: Transaction, old: DecorationSet) =>
            tr.docChanged ? decorate(tr.doc) : old.map(tr.mapping, tr.doc)
        }
      })
  )
}
