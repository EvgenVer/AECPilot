// Classifying and naming attachments (task 1.6.A4). Pure, and shared: main
// needs the classification to pick the right gateway method and to build the
// file dialog's filters, the renderer needs the labels. The decisions here
// must agree with the gateway's own rules, so they are pinned by test rather
// than discovered at runtime.

/** Exactly their `cli._IMAGE_EXTENSIONS`. Kept as a literal copy rather than a
 * looser guess: an extension we accept but they reject produces error 4016
 * after the user has already picked the file, which is a worse experience
 * than not offering it. */
const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.svg',
  '.ico'
])

export type AttachmentKind = 'image' | 'pdf' | 'unsupported'

export function classifyAttachment(path: string): AttachmentKind {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return 'unsupported'
  const ext = path.slice(dot).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  return IMAGE_EXTENSIONS.has(ext) ? 'image' : 'unsupported'
}

/** Extensions for the file dialog's filters, without the leading dot. */
export const IMAGE_DIALOG_EXTENSIONS = [...IMAGE_EXTENSIONS].map((ext) => ext.slice(1))

/** The file name alone — a chip showing a full Windows path would push
 * everything else out of the composer. */
export function attachmentLabel(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** A PDF becomes several attachments, one image per rendered page, so the
 * count in the composer will not match the number of files chosen. Saying so
 * is the difference between "why are there twelve" and "twelve pages". */
export function attachmentSummary(count: number): string {
  if (count === 0) return ''
  const noun = count === 1 ? 'вложение' : count < 5 ? 'вложения' : 'вложений'
  return `${count} ${noun}`
}

/** Turns a gateway attachment failure into something worth reading.
 *
 * Their PDF path shells out to `pdftoppm` and answers 5028 when it is missing.
 * On Windows that is the normal state of the machine, not a broken install, so
 * the message has to say what to do rather than repeat the tool name. */
export function attachmentErrorMessage(raw: string): string {
  if (raw.includes('pdftoppm')) {
    return 'PDF не прикрепить: на этой машине нет poppler (pdftoppm). Приложите страницы картинками либо установите poppler.'
  }
  if (raw.includes('No image found in clipboard')) return 'В буфере обмена нет картинки.'
  if (raw.includes('Clipboard has image but extraction failed')) {
    return 'Картинка в буфере есть, но её не удалось прочитать.'
  }
  return raw
}
