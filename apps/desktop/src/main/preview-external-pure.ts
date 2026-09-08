// Задача 3E.26 (SPEC UR22, замечание D-75, пункт Б): их кнопка «открыть
// предпросмотр в браузере». Здесь решение, что именно позволено отдать
// настоящему браузеру человека; сам вызов — в обработчике.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ДВЕРЬ, А НЕ РАСШИРЕНИЕ `decideExternalLink`. Та политика
// схему `file:` запрещает нарочно и с записанной причиной: открыть местный путь
// из текста агента — это примитив «открой любой файл». Расширить её значило бы
// раздать эту возможность каждому месту, которое зовёт `shell:open-external`,
// включая ссылки внутри ответа модели. Поэтому дверь своя и узкая: сюда
// приходит только адрес открытой ВКЛАДКИ предпросмотра.
//
// ЧТО ИМЕННО ОСЛАБЛЕНО (записано словами в SPEC UR22, решение владельца
// 2026-09-08). HTML, произведённый агентом, по явному нажатию человека уходит
// из нашей песочницы и исполняется в его браузере с правами локального файла.
// Цена принята при прямом вопросе. Граница, которая при этом ОСТАЁТСЯ: окно не
// выбирает, какой файл открыть, — только тот, что главный процесс уже показал
// человеку (проект, выбранное в диалоге) либо сам же и записал по просьбе окна
// (папка вложений). Иначе кнопка стала бы дорогой к `~/.ssh/id_rsa`.

import { pathToFileURL } from 'node:url'

import { isInsideAttachmentsDir } from './attachments'
import { isInside, resolveArtifactPath } from './artifact-files-pure'
import { decideExternalLink } from './external-link-policy'

export const PREVIEW_EXTERNAL_ERROR =
  'В браузере открывается только страница проекта, выбранный вами файл или то, что предпросмотр сам выгрузил'

export type ExternalPreviewDecision =
  { ok: true; url: string; staged: boolean } | { ok: false; error: string }

export interface ExternalPreviewScope {
  /** Куда `saveImageBuffer` кладёт выгруженное содержимое вкладки. */
  attachmentsDir: string
  projectRoot?: string
}

/** Сетевой адрес отдаём общей политике: правило «что можно отдать ОС» одно на
 * приложение, и второй его копии здесь быть не должно. */
function looksLikeWebLink(raw: string): boolean {
  return /^(?:https?|mailto):/i.test(raw)
}

/** Можно ли отдать браузеру то, что назвала вкладка предпросмотра. */
export function decideOpenPreviewExternal(
  value: unknown,
  scope: ExternalPreviewScope,
  pickedByUser: (candidate: string) => boolean
): ExternalPreviewDecision {
  if (typeof value === 'string' && looksLikeWebLink(value.trim())) {
    const web = decideExternalLink(value.trim())

    return web.allowed
      ? { ok: true, url: web.url, staged: false }
      : { ok: false, error: web.reason }
  }

  const resolved = resolveArtifactPath(scope.projectRoot, value)

  if (!resolved.ok) return { ok: false, error: resolved.error }

  // `staged` — это и есть «содержимое вкладки выгружено файлом и уходит за
  // песочницу»: только эта ветка пишет на диск то, что показывал предпросмотр.
  // Открытие страницы проекта или сетевого адреса ничего наружу не выносит,
  // поэтому и говорить о песочнице там не о чем.
  const staged = isInsideAttachmentsDir(scope.attachmentsDir, resolved.absPath)
  const allowed =
    isInside(scope.projectRoot, resolved.absPath) || pickedByUser(resolved.absPath) || staged

  if (!allowed) return { ok: false, error: PREVIEW_EXTERNAL_ERROR }

  // Отдаём НОРМАЛИЗОВАННЫЙ адрес — по той же причине, по какой это делает
  // `decideExternalLink`: строка, которую проверили, и строка, которую открыли,
  // не должны различаться.
  return { ok: true, staged, url: pathToFileURL(resolved.absPath).toString() }
}
