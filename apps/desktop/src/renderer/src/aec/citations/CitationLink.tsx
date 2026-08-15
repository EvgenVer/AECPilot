// A citation in an agent's answer, as the reader sees and clicks it (task 2.13).
//
// The answer text carries the machine form — `[src: <source>/<path>#<locator>]`
// — because that is what the eval runner checks and what survives copy-paste.
// This turns it into what an engineer wants: the file name, the page, and one
// click to the place itself.

import { openDocument } from '../viewers/viewer-store'

import { citationLabel, type Citation } from './citation-pure'

export function CitationChip({ citation }: { citation: Citation }): React.JSX.Element {
  return (
    <button
      className="bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border-border mx-0.5 inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 align-baseline text-xs transition-colors"
      onClick={() =>
        openDocument({
          locator: citation.locator,
          relPath: citation.relPath,
          sourceId: citation.sourceId
        })
      }
      title={citation.raw}
      type="button"
    >
      <span className="codicon codicon-file" aria-hidden />
      <span className="truncate">{citationLabel(citation)}</span>
    </button>
  )
}
