// Задача T79 (UR54): «Упомянуть в чате» из дерева хранилища и источников.
//
// В поле ввода встаёт плашка их составителя (та же шина, что у перетаскивания
// файлов), а агенту уходит точный адрес. Вид `@path:` выбран нарочно: `@file:` и
// `@folder:` ядро раскрывает — вставляет текст файла или опись папки прямо в
// сообщение, а за пределами рабочей папки (источник на сервере) отказывает.
// Владельцу нужно другое: агент получает адрес и сам решает, чем его читать.
// Незнакомый ядру вид оно оставляет в тексте как есть (`context_references.py`:
// встроенные виды — file, folder, git, url, diff, staged).

import {
  requestComposerFocus,
  requestComposerInsertRefs
} from '../../donor/app/chat/composer/focus'
import { notifyError } from '../../donor/store/notifications'

export const MENTION_KIND = 'path'

type PathAnswer = { ok: true; path: string } | { ok: false; error: string }

/** Плашка для поля ввода: имя видно человеку, адрес едет агенту. */
export function mentionRef(
  absPath: string,
  name: string,
  isDir: boolean
): { kind: string; label: string; value: string } {
  return { kind: MENTION_KIND, label: isDir ? `${name}/` : name, value: absPath }
}

/** Адрес — у главного процесса (путь собирает он, не окно), затем плашка. */
export async function mentionInChat(
  resolvePath: () => Promise<PathAnswer>,
  name: string,
  isDir: boolean,
  failedTitle: string
): Promise<boolean> {
  const answer = await resolvePath().catch((error: unknown): PathAnswer => ({
    ok: false,
    error: String(error)
  }))
  if (!answer.ok) {
    notifyError(answer.error, failedTitle)
    return false
  }
  requestComposerInsertRefs([mentionRef(answer.path, name, isDir)])
  requestComposerFocus('active')
  return true
}
