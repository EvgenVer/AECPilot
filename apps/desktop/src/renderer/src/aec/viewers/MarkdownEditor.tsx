// Правка .md прямо в приложении (задача 4.5).
//
// Markdown — единственный формат, который здесь и смотрят, и правят: файлы
// vault наши, их пишет агент и дописывает человек. Остальные форматы
// открываются только на чтение (SPEC UR2, AC6 — источники read-only; DOCX
// обратно не пишется вовсе, docs/plan-details.md §зависимости).
//
// Milkdown берётся голым ядром, без их React-обёртки: обёртка — ещё один
// пакет ради одного `useEffect`, а редактор всё равно живёт вне React —
// ProseMirror держит своё дерево сам.
//
// Сохранение автоматическое, с паузой: сохранять на каждую букву значит писать
// на диск сотню раз в минуту, а кнопка «сохранить» в приложении, где рядом
// работает агент, забывается ровно один раз — тот, который стоит правки.

import type { Editor as MilkdownEditor } from '@milkdown/kit/core'
import { useStore } from '@nanostores/react'
import { useEffect, useRef, useState } from 'react'

import { useAecT } from '../../shared/i18n'

import { gfmTableInputPlugin } from './gfm-table-input'
import { decodeText } from './text-decode'
import { citationLinkPlugin } from './citation-link-plugin'
import { imageTitlePlugin, vaultLinkPlugin } from './vault-link-plugin'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument } from './viewer-store'
import { openWikiPage } from './wikilink-open'
import { wikilinkPlugin } from './wikilink-plugin'
import { unescapeWikiLinks } from './wikilink-pure'

/** Пауза до записи. Секунда: достаточно, чтобы не писать во время набора, и
 *  мало, чтобы правка не потерялась, если человек сразу переключился. */
const SAVE_AFTER_MS = 1000

type Saving = 'clean' | 'dirty' | 'saved' | { error: string }

/** Задача T74 (UR56): файл на диске изменил кто-то другой (агент), пока в окне
 *  лежит несохранённая правка. Решает человек: чья версия остаётся. */
type Conflict = { keepMine: () => void; takeTheirs: () => void } | null

export function MarkdownEditor(): React.JSX.Element | null {
  const t = useAecT()
  const request = useStore($openDocument)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [state, setState] = useState<{ error?: string; token: number }>({ token: 0 })
  const [saving, setSaving] = useState<Saving>('clean')
  const [conflict, setConflict] = useState<Conflict>(null)

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
    // Только тип: сам модуль по-прежнему грузится лениво, ниже.
    let editor: MilkdownEditor | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    /** Снять markdown с живого документа — их макрос, подставляется после
     *  загрузки редактора. */
    let readLive: (() => string) | null = null
    /** Текст, каким его знает диск, — в записи самого редактора: сравнивать
     *  с сырым файлом нельзя, сериализация нормализует разметку, и каждый
     *  уход с вкладки выглядел бы правкой. */
    let onDisk = ''

    /** Сырой текст файла, каким его последний раз прочитал или записал этот
     *  редактор. Событие о своей же записи сравнивается с ним и пропускается. */
    let rawOnDisk = ''

    const save = async (): Promise<void> => {
      const work = pending.current
      if (!work) return
      pending.current = null
      rawOnDisk = work.text
      const result = await window.aecpilot.writeVaultFile(work.rel, work.text)
      if (result.ok) onDisk = work.text
      setSaving(result.ok ? 'saved' : { error: result.error })
    }

    /** Поставить в редактор текст с диска, не считая это правкой человека. */
    let showOnDisk: ((text: string) => void) | null = null

    // Задача T74 (UR56): файл изменили снаружи (агент). Своих правок нет —
    // текст подменяется молча; есть — спрашиваем, чья версия остаётся. Ничья
    // правка не теряется без решения человека.
    const unsubscribe = window.aecpilot.onVaultChanged((paths) => {
      const rel = request.relPath.toLowerCase()
      if (!paths.some((path) => path.toLowerCase() === rel)) return
      void (async () => {
        const read = await window.aecpilot.readDocument(request.relPath)
        if (cancelled || !read.ok || !readLive || !showOnDisk) return
        const theirs = decodeText(read.bytes).text
        if (theirs === rawOnDisk) return
        rawOnDisk = theirs
        const mine = readLive()
        const dirty = pending.current !== null || mine !== onDisk
        if (!dirty) {
          showOnDisk(theirs)
          return
        }
        if (timer) clearTimeout(timer)
        setConflict({
          keepMine: () => {
            setConflict(null)
            pending.current = { rel: request.relPath, text: readLive?.() ?? mine }
            void save()
          },
          takeTheirs: () => {
            setConflict(null)
            pending.current = null
            showOnDisk?.(theirs)
            setSaving('clean')
          }
        })
      })()
    })

    void (async () => {
      const read = await window.aecpilot.readDocument(request.relPath)
      if (cancelled) return
      if (!read.ok) {
        setState({ error: read.error, token: request.token })
        return
      }
      rawOnDisk = decodeText(read.bytes).text

      const [
        { Editor, defaultValueCtx, remarkStringifyOptionsCtx, rootCtx },
        { commonmark },
        { gfm },
        { history },
        listen,
        { getMarkdown, replaceAll }
      ] = await Promise.all([
        import('@milkdown/kit/core'),
        import('@milkdown/kit/preset/commonmark'),
        import('@milkdown/kit/preset/gfm'),
        import('@milkdown/kit/plugin/history'),
        import('@milkdown/kit/plugin/listener'),
        import('@milkdown/kit/utils')
      ])
      if (cancelled) return

      const rel = request.relPath
      editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, host)
          ctx.set(defaultValueCtx, decodeText(read.bytes).text)
          // Маркер списка «-», как пишут люди и агент; их умолчание «*»
          // переписывало бы каждый список файла при первом же сохранении (D-95).
          ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, bullet: '-' as const }))
          ctx.get(listen.listenerCtx).markdownUpdated((_ctx, markdown, previous) => {
            // Первое событие приходит на загрузку документа, а не на правку.
            if (previous === undefined) return
            // Текст, поставленный с диска (T74), — не правка человека.
            if (unescapeWikiLinks(markdown) === onDisk) return
            pending.current = { rel, text: unescapeWikiLinks(markdown) }
            setSaving('dirty')
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => void save(), SAVE_AFTER_MS)
          })
        })
        .use(commonmark)
        // gfm — ради таблиц: вики и заметки по проекту без них не живут.
        .use(gfm)
        .use(wikilinkPlugin((wanted) => void openWikiPage(wanted)))
        // Ссылка на источник `[src: …](#cite)` открывает документ, как фишка в чате.
        .use(citationLinkPlugin())
        // T75 (UR55): `[текст](путь)` открывает файл, картинки vault видны.
        .use(vaultLinkPlugin(rel))
        .use(imageTitlePlugin)
        // Таблица, набранная разметкой, становится таблицей (D-94).
        .use(gfmTableInputPlugin)
        // История своя у ProseMirror; без неё Ctrl+Z в редакторе не работает.
        .use(history)
        .use(listen.listener)
        .create()

      if (cancelled) {
        void editor.destroy()
        return
      }
      const live = editor
      readLive = () => unescapeWikiLinks(live.action(getMarkdown()))
      onDisk = readLive()
      showOnDisk = (text: string) => {
        live.action(replaceAll(text))
        onDisk = readLive?.() ?? text
      }
      setState({ token: request.token })
    })()

    return () => {
      cancelled = true
      unsubscribe()
      setConflict(null)
      if (timer) clearTimeout(timer)
      // Несохранённое дописывается при уходе: переключение вкладки не должно
      // стоить последней секунды набора. Их слушатель отдаёт markdown с
      // задержкой 200 мс и ОТМЕНЯЕТ её при уничтожении — набранное в последние
      // мгновения до `pending` не доезжало и терялось (D-93, автоприёмка
      // 20.3.1). Поэтому текст снимается с живого документа, а не ждётся.
      if (readLive) {
        try {
          const current = readLive()
          if (current !== onDisk) pending.current = { rel: request.relPath, text: current }
        } catch {
          // Редактор уже мёртв — остаётся то, что успел отдать слушатель.
        }
      }
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

      {conflict ? (
        <div
          className="border-border flex flex-wrap items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs"
          role="alert"
        >
          <span className="text-foreground">{t('viewer.conflict')}</span>
          <button
            className="hover:bg-muted rounded border px-2 py-0.5"
            onClick={conflict.takeTheirs}
            type="button"
          >
            {t('viewer.conflictTakeTheirs')}
          </button>
          <button
            className="hover:bg-muted rounded border px-2 py-0.5"
            onClick={conflict.keepMine}
            type="button"
          >
            {t('viewer.conflictKeepMine')}
          </button>
        </div>
      ) : null}

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
            (docs/plan-details.md §зависимости). Своей темы Milkdown не несёт, и это к лучшему:
            редактор выглядит так же, как ответ агента над ним. */}
        <div className="prose prose-sm dark:prose-invert max-w-none" ref={hostRef} />
      </div>
    </div>
  )
}
