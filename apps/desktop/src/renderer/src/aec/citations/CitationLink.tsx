// A citation in an agent's answer, as the reader sees and clicks it (task 2.13).
//
// The answer text carries the machine form — `[src: <source>/<path>#<locator>]`
// — because that is what the eval runner checks and what survives copy-paste.
// This turns it into what an engineer wants: the file name, the page, and one
// click to the place itself.
//
// Задача 3.31b: сюда же приходит вторая половина обещания. Если рядом со
// ссылкой стоит выдержка, которой в источнике нет, фишка меняет вид и говорит
// об этом. Текст ответа при этом не трогается: переписывать сказанное агентом
// приложение не вправе, а «этой фразы в документе нет» — как раз то, что
// человеку нужно знать.

import { useStore } from '@nanostores/react'

import { openDocument } from '../viewers/viewer-store'
import { useAecT } from '../../shared/i18n'
import { PROJECT_SOURCE_ID } from '../../../../shared/source-name'

import { citationLabel, type Citation } from './citation-pure'
import { $unverifiedQuotes } from './quote-verdicts'

export function CitationChip({ citation }: { citation: Citation }): React.JSX.Element {
  const t = useAecT()
  const unverified = useStore($unverifiedQuotes)[citation.raw] ?? []
  // Задача 3K.6: черновик или страница вики не должны выглядеть первоисточником.
  const projectFile = citation.sourceId === PROJECT_SOURCE_ID

  const raw = projectFile ? `${citation.raw}\n${t('citations.projectFileHint')}` : citation.raw
  const title = unverified.length
    ? `${raw}\n\n${t('citations.unverified')}\n${unverified.map((quote) => `«${quote}»`).join('\n')}`
    : raw

  return (
    <button
      className={
        unverified.length
          ? 'mx-0.5 inline-flex max-w-full items-center gap-1 truncate rounded border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 align-baseline text-xs text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border-border mx-0.5 inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 align-baseline text-xs transition-colors'
      }
      onClick={() =>
        openDocument({
          locator: citation.locator,
          relPath: citation.relPath,
          sourceId: citation.sourceId
        })
      }
      title={title}
      type="button"
    >
      <span
        className={`codicon ${unverified.length ? 'codicon-warning' : 'codicon-file'}`}
        aria-hidden
      />
      {projectFile && <span className="shrink-0 opacity-75">{t('citations.projectFile')}:</span>}
      <span className="truncate">{citationLabel(citation, t('citations.pageAbbr'))}</span>
    </button>
  )
}
