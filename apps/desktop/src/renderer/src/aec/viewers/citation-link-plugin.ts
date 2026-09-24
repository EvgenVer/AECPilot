// Ссылка на источник `[src: …](#cite)` в редакторе: щелчок открывает документ
// на месте ссылки — так же, как фишка в ответе агента (чек-лист 22.1.4).
//
// Замер 24.09.2026 (автоприёмка 3F.10): в странице вики ссылка показывалась, но
// щелчок только ставил курсор — обработчик был лишь у `[[…]]` (wikilink-plugin).
// Как и там — без узла схемы: документ от плагина не меняется ни на символ.

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'

import { isCitationHref, parseCitationLabel, type Citation } from '../citations/citation-pure'
import { openDocument } from './viewer-store'

const KEY = new PluginKey('aec-citation-link')

/** Цитата, на которую указывает ссылка, или `null`, если это не она: ссылка
 *  ведёт не на `#cite` или её текст — не одна машинная ссылка. */
export function citationFromLink(href: string | undefined, label: string): Citation | null {
  if (!isCitationHref(href)) return null
  return parseCitationLabel(label)
}

export function citationLinkPlugin() {
  return $prose(
    () =>
      new Plugin({
        key: KEY,
        props: {
          handleClick: (view, position) => {
            const node = view.state.doc.nodeAt(position)
            const mark = node?.marks.find((candidate) => candidate.type.name === 'link')
            if (!node?.text || !mark) return false
            const citation = citationFromLink(mark.attrs.href as string | undefined, node.text)
            if (!citation) return false
            openDocument({ locator: citation.locator, relPath: citation.relPath, sourceId: citation.sourceId })
            // Клик съеден: иначе рядом с переходом встал бы ещё и курсор.
            return true
          }
        }
      })
  )
}
