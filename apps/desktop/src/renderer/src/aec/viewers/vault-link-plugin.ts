// Задача T75 (UR55): в md-редакторе `[текст](путь)` открывает файл в окне
// документов, а `![](путь)` и `![[картинка]]` показывают картинку из vault.
//
// Как и у `[[…]]` (wikilink-plugin), документ от плагина не меняется ни на
// символ: щелчок — обработчик, картинка `![](…)` — отображение узла (node view),
// картинка `![[…]]` — украшение-виджет рядом с текстом ссылки. Сериализатор
// markdown их не видит, и файл человека остаётся тем же файлом.
//
// Картинка грузится байтами через мост (`readDocument`), а не адресом `file://`:
// окну не дано читать диск, и относительный путь в `<img>` вёл бы мимо vault.

import { $prose, $remark } from '@milkdown/kit/utils'
import type { Node } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'

import { openMarkdownLink, vaultImageUrl } from './vault-link-open'
import { isEmbedAt, isImageName } from './vault-link-pure'
import { findWikiLinks } from './wikilink-pure'

const KEY = new PluginKey('aec-vault-link')

const IMAGE_CLASS = 'my-2 block max-w-full rounded'

function imageElement(
  fromRel: string,
  reference: { name: string } | { path: string },
  alt: string
): HTMLImageElement {
  const img = document.createElement('img')
  img.className = IMAGE_CLASS
  img.alt = alt
  img.dataset.vaultImage = 'name' in reference ? reference.name : reference.path
  void vaultImageUrl(fromRel, reference).then((url) => {
    if (url) img.src = url
    else img.dataset.missing = 'true'
  })
  return img
}

/** Ревью T84: blob-адрес картинки держит её байты, пока его не освободят, —
 *  освобождается, когда ProseMirror снимает картинку. */
function releaseImage(dom: globalThis.Node): void {
  const src = (dom as HTMLImageElement).src
  if (src?.startsWith('blob:')) URL.revokeObjectURL(src)
}

function decorateEmbeds(doc: Node, fromRel: string): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, position) => {
    if (!node.isTextblock) return true
    const text = node.textContent
    for (const link of findWikiLinks(text)) {
      if (!isEmbedAt(text, link.start) || !isImageName(link.target)) continue
      decorations.push(
        Decoration.widget(
          position + 1 + link.end,
          () => imageElement(fromRel, { name: link.target }, link.label),
          { destroy: releaseImage, key: `embed:${link.target}`, side: 1 }
        )
      )
    }
    return true
  })
  return DecorationSet.create(doc, decorations)
}

/** @param fromRel — путь открытого md-файла в vault: от его папки считаются
 *  относительные ссылки и картинки. */
export function vaultLinkPlugin(fromRel: string) {
  return $prose(
    () =>
      new Plugin({
        key: KEY,
        props: {
          decorations: (state) => KEY.getState(state) as DecorationSet,
          handleClick: (view, position) => {
            const node = view.state.doc.nodeAt(position)
            const mark = node?.marks.find((candidate) => candidate.type.name === 'link')
            const href = mark?.attrs.href as string | undefined
            // `#cite` — цитата, её открывает свой плагин.
            if (!href || href.startsWith('#')) return false
            return openMarkdownLink(fromRel, href)
          },
          nodeViews: {
            image: (node) => {
              const src = String(node.attrs.src ?? '')
              const alt = String(node.attrs.alt ?? '')
              if (/^(?:https?:|data:|blob:)/i.test(src)) {
                const img = document.createElement('img')
                img.className = IMAGE_CLASS
                img.src = src
                img.alt = alt
                return { dom: img }
              }
              const dom = imageElement(fromRel, { path: src }, alt)
              return { destroy: () => releaseImage(dom), dom }
            }
          }
        },
        state: {
          init: (_config, state: EditorState) => decorateEmbeds(state.doc, fromRel),
          apply: (tr: Transaction, old: DecorationSet) =>
            tr.docChanged ? decorateEmbeds(tr.doc, fromRel) : old.map(tr.mapping, tr.doc)
        }
      })
  )
}

type MdNode = { children?: MdNode[]; title?: null | string; type: string }

function fillImageTitles(node: MdNode): void {
  if (node.type === 'image' && node.title == null) node.title = ''
  for (const child of node.children ?? []) fillImageTitles(child)
}

/** Картинка без подписи (`![](путь)`) роняла разбор всего файла: remark даёт
 *  `title: null`, а схема Milkdown 7.22 на свежем prosemirror-model требует
 *  строку — «Expected value of type string for attribute title» (найдено тестом
 *  T75). Пустая строка в файл не пишется: сериализатор пропускает пустую подпись. */
export const imageTitlePlugin = $remark('aec-image-title', () => () => (tree: unknown) => {
  fillImageTitles(tree as MdNode)
})
