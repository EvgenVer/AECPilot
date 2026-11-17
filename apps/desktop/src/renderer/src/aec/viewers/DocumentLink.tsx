// Задача T77 (UR55): ссылка агента на документ проекта открывает окно
// документов, а не предпросмотр. Файл вне хранилища и источников — карточка
// предпросмотра донора, как было: читать его окну документов нечем.

import { useStore } from '@nanostores/react'
import { useEffect, useState, type ReactNode } from 'react'

import { useSessionView } from '../../donor/app/chat/session-view'
import { PreviewAttachment } from '../../donor/components/chat/preview-attachment'

import { openDocument } from './viewer-store'

type Place = { relPath: string; sourceId?: string } | 'pending' | 'outside'

function nameOf(target: string): string {
  return target.split(/[\\/]/).filter(Boolean).pop() ?? target
}

export function DocumentLink({
  children,
  target
}: {
  children?: ReactNode
  target: string
}): React.JSX.Element {
  const view = useSessionView()
  const cwd = useStore(view.$cwd)
  // Ответ помечен своей парой «папка + цель»: сменилась пара — ответ прежней
  // ссылки уже не годится, и до нового кнопка ждёт.
  const key = `${cwd ?? ''}|${target}`
  const [answered, setAnswered] = useState<{ key: string; place: Place }>({
    key: '',
    place: 'pending'
  })
  const place: Place = answered.key === key ? answered.place : 'pending'

  useEffect(() => {
    let current = true
    // Сбой моста (окно без него) — та же карточка предпросмотра, а не падение ответа.
    void Promise.resolve()
      .then(() => window.aecpilot.locateDocument(target, cwd || undefined))
      .then((answer) => {
        if (!current) return
        setAnswered({
          key,
          place: answer.ok ? { relPath: answer.relPath, sourceId: answer.sourceId } : 'outside'
        })
      })
      .catch(() => {
        if (current) setAnswered({ key, place: 'outside' })
      })
    return () => {
      current = false
    }
  }, [cwd, key, target])

  if (place === 'outside') return <PreviewAttachment target={target} />

  return (
    <button
      className="ref inline font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
      data-document-link={target}
      disabled={place === 'pending'}
      onClick={() => {
        if (typeof place === 'object') openDocument({ locator: {}, ...place })
      }}
      title={target}
      type="button"
    >
      {children ?? nameOf(target)}
    </button>
  )
}
