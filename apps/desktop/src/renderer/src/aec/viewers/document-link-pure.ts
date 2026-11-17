// Задача T77 (UR55): какая ссылка из ответа агента — документ для окна документов.
//
// Правило владельца (2026-11-17): md, PDF, Word, Excel и текст — в окне
// документов; веб-страницы, HTML и картинки — в предпросмотре, как у донора.
// Здесь — только разбор ссылки; принадлежит ли файл проекту, решает главный
// процесс (`locateDocument`): чужой файл тоже уходит в предпросмотр.

import { filePathFromMediaPath, mediaPathFromMarkdownHref } from '../../donor/lib/media'
import { previewTargetFromMarkdownHref } from '../../donor/lib/preview-targets'

/** Те же форматы, что раздаёт окно документов (`DocumentViewer`, BY_FORMAT). */
const DOCUMENT = /\.(md|markdown|pdf|docx|xlsx|csv|txt)$/i

/** Схема в начале ссылки (`https:`, `mailto:`), но не буква диска (`C:`). */
const SCHEME = /^[a-z][a-z0-9+.-]+:/i

/** Путь к документу из ссылки агента, или `null`, если ссылка — не документ. */
export function documentTargetFromHref(href: string | undefined): string | null {
  if (!href) return null
  const wrapped = mediaPathFromMarkdownHref(href) ?? previewTargetFromMarkdownHref(href)
  let target: string
  if (wrapped !== null) target = wrapped
  else if (href.startsWith('#')) return null
  else if (/^file:/i.test(href)) target = href
  else if (SCHEME.test(href)) return null
  else target = href
  if (/^file:/i.test(target)) target = filePathFromMediaPath(target)
  // `%20` и кириллица в markdown-ссылке приходят закодированными.
  try {
    target = decodeURIComponent(target)
  } catch {
    // Нераскодируемый путь берётся как есть.
  }
  // `#страница` и `?…` после имени — не часть имени файла.
  const bare = target.replace(/[?#].*$/, '')
  return DOCUMENT.test(bare) ? bare : null
}
