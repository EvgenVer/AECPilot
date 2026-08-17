// Просмотр текстового файла (задача 4.2).
//
// Ровно то, что нужно: содержимое как есть, моноширинным, с переносом длинных
// строк. Ни подсветки синтаксиса, ни правки — .txt в проекте это выгрузка из
// расчётной программы или список кабелей, и «улучшать» его нечем.
//
// Кодировка показана рядом с именем файла. Не из любви к деталям: если файл
// прочитан кодовой страницей, а выглядит странно — человек должен видеть, чем
// его прочитали, иначе он будет искать поломку в самом файле.

import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { useAecT } from '../../shared/i18n'

import { decodeText, type DecodedText } from './text-decode'
import { ViewerHeader } from './ViewerHeader'
import { $openDocument } from './viewer-store'

type State = { decoded?: DecodedText; error?: string; token: number }

export function TextViewer(): React.JSX.Element | null {
  const t = useAecT()
  const request = useStore($openDocument)
  const [state, setState] = useState<State>({ token: 0 })

  useEffect(() => {
    if (!request) return

    let cancelled = false
    void (async () => {
      const result = await window.aecpilot.readDocument(request.relPath, request.sourceId)
      if (cancelled) return
      setState(
        result.ok
          ? { decoded: decodeText(result.bytes), token: request.token }
          : { error: result.error, token: request.token }
      )
    })()

    return () => {
      cancelled = true
    }
  }, [request])

  if (!request) return null

  const settled = state.token === request.token

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader relPath={request.relPath}>
        {settled && state.decoded ? (
          <span className="text-muted-foreground text-xs">{state.decoded.encoding}</span>
        ) : null}
      </ViewerHeader>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!settled ? (
          <div className="text-muted-foreground text-sm">{t('viewer.opening')}</div>
        ) : state.error ? (
          <div className="text-destructive space-y-2 text-sm">
            <div>{t('viewer.failed', state.error)}</div>
            <div className="text-muted-foreground break-all">{request.relPath}</div>
          </div>
        ) : (
          <pre className="font-mono text-xs whitespace-pre-wrap">{state.decoded?.text}</pre>
        )}
      </div>
    </div>
  )
}
