// The pane a citation opens into (task 2.14).
//
// One dispatch by format, and an honest answer for the formats Phase 2 does not
// open yet: DOCX, XLSX and CSV get their viewers in Phase 4 (tasks 4.2–4.4).
// Until then the citation still resolves — the file is named, and the reader is
// one click from it in the OS file manager — because «this link does nothing»
// would be read as a broken citation rather than as a missing viewer.

import { useStore } from '@nanostores/react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { PdfViewer } from './PdfViewer'
import { $openDocument, closeDocument } from './viewer-store'

const PDF = /\.pdf$/i

export function DocumentViewer(): React.JSX.Element {
  const t = useAecT()
  const request = useStore($openDocument)

  if (!request || PDF.test(request.relPath)) {
    return <PdfViewer />
  }

  const name = request.relPath.split('/').pop() ?? request.relPath

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <span className="truncate text-sm font-medium" title={request.relPath}>
          {name}
        </span>
        <Button
          aria-label={t('viewer.close')}
          className="ml-auto"
          onClick={closeDocument}
          size="sm"
          variant="ghost"
        >
          ✕
        </Button>
      </div>
      <div className="text-muted-foreground space-y-3 p-4 text-sm">
        <p>{t('viewer.unsupported')}</p>
        <p className="text-foreground break-all">{request.relPath}</p>
        <Button
          onClick={() => {
            void (request.sourceId
              ? window.aecpilot.showSourceEntryInExplorer(request.sourceId, request.relPath)
              : window.aecpilot.showVaultEntryInExplorer(request.relPath))
          }}
          size="sm"
          variant="outline"
        >
          {t('viewer.showInExplorer')}
        </Button>
      </div>
    </div>
  )
}
