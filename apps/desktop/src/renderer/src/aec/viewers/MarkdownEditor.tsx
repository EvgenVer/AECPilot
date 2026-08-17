// Правка .md прямо в приложении (задача 4.5).
//
// Markdown — единственный формат, который здесь и смотрят, и правят: файлы
// vault наши, их пишет агент и дописывает человек. Остальные форматы
// открываются только на чтение (SPEC UR2, AC6 — источники read-only; DOCX
// обратно не пишется вовсе, PLAN §зависимости).
//
// Milkdown берётся голым ядром, без их React-обёртки: обёртка — ещё один
// пакет ради одного `useEffect`, а редактор всё равно живёт вне React —
// ProseMirror держит своё дерево сам.
//
// Сохранение автоматическое, с паузой: сохранять на каждую букву значит писать
// на диск сотню раз в минуту, а кнопка «сохранить» в приложении, где рядом
// работает агент, забывается ровно один раз — тот, который стоит правки.

import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { useAecT } from '../../shared/i18n'

import { decodeText } from './text-decode'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument } from './viewer-store'

/** Пауза до записи. Секунда: достаточно, чтобы не писать во время набора, и
 *  мало, чтобы правка не потерялась, если человек сразу переключился. */
const SAVE_AFTER_MS = 1000

type Saving = 'clean' | 'dirty' | 'saved' | { error: string }

export function MarkdownEditor(): React.JSX.Element | null {
  const t = useAecT()
  const request = useStore($openDocument)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<{ error?: string; token: number }>({ token: 0 })
  const [saving, setSaving] = useState<Saving>('clean')

  // Правка, ещё не доехавшая до диска, и путь, которому она принадлежит.
  // Вместе, одним объектом: разъехавшись, они запишут текст одного файла в
  // другой — цена ошибки здесь чужая работа.
  const pending = useRef<{ rel: string; text: string } | null>(null)

  useEffect(() => {
    if (!request) return
    // Источники read-only: их .md показывает обычный текстовый просмотрщик.
    if (request.sourceId) return

    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let editor: { destroy: () => Promise<unknown> } | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const save = async (): Promise<void> => {
      const work = pending.current
      if (!work) return
      pending.current = null
      const result = await window.aecpilot.writeVaultFile(work.rel, work.text)
      setSaving(result.ok ? 'saved' : { error: result.error })
    }

    void (async () => {
      const read = await window.aecpilot.readDocument(request.relPath)
      if (cancelled) return
      if (!read.ok) {
        setState({ error: read.error, token: request.token })
        return
      }

      const [{ Editor, defaultValueCtx, rootCtx }, { commonmark }, { gfm }, { history }, listen] =
        await Promise.all([
          import('@milkdown/kit/core'),
          import('@milkdown/kit/preset/commonmark'),
          import('@milkdown/kit/preset/gfm'),
          import('@milkdown/kit/plugin/history'),
          import('@milkdown/kit/plugin/listener')
        ])
      if (cancelled) return

      const rel = request.relPath
      editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, host)
          ctx.set(defaultValueCtx, decodeText(read.bytes).text)
          ctx.get(listen.listenerCtx).markdownUpdated((_ctx, markdown, previous) => {
            // Первое событие приходит на загрузку документа, а не на правку.
            if (previous === undefined) return
            pending.current = { rel, text: markdown }
            setSaving('dirty')
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => void save(), SAVE_AFTER_MS)
          })
        })
        .use(commonmark)
        // gfm — ради таблиц: вики и заметки по проекту без них не живут.
        .use(gfm)
        // История своя у ProseMirror; без неё Ctrl+Z в редакторе не работает.
        .use(history)
        .use(listen.listener)
        .create()

      if (cancelled) void editor.destroy()
      else setState({ token: request.token })
    })()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      // Несохранённое дописывается при уходе: переключение вкладки не должно
      // стоить последней секунды набора.
      void save()
      void editor?.destroy()
    }
  }, [request])

  if (!request) return null
  if (request.sourceId) return null

  const settled = state.token === request.token

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader relPath={request.relPath}>
        <span className="text-muted-foreground text-xs">
          {typeof saving === 'object'
            ? t('viewer.saveFailed', saving.error)
            : saving === 'dirty'
              ? t('viewer.saving')
              : saving === 'saved'
                ? t('viewer.saved')
                : ''}
        </span>
      </ViewerHeader>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!settled && !state.error ? (
          <div className="text-muted-foreground text-sm">{t('viewer.opening')}</div>
        ) : null}
        {state.error ? (
          <div className="text-destructive space-y-2 text-sm">
            <div>{t('viewer.failed', state.error)}</div>
            <div className="text-muted-foreground break-all">{request.relPath}</div>
          </div>
        ) : null}
        {/* `prose` — типографика Tailwind, уже стоящая ради их markdown-рендера
            (PLAN §зависимости). Своей темы Milkdown не несёт, и это к лучшему:
            редактор выглядит так же, как ответ агента над ним. */}
        <div className="prose prose-sm dark:prose-invert max-w-none" ref={hostRef} />
      </div>
    </div>
  )
}
