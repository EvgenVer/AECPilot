// The pane a citation opens into (task 2.14; вкладки — задача 4.1).
//
// Здесь две вещи: полоса вкладок, общая для всех форматов, и раздача по
// формату. Вкладки стоят именно тут, а не в PDF-просмотрщике: сверяя ответ,
// инженер держит открытыми и лист чертежа, и ведомость, и переключение между
// ними не должно зависеть от того, чем каждая из них открывается.
//
// Форматам, у которых просмотрщика ещё нет, даётся честный ответ: файл назван и
// открывается в проводнике ОС. «Ссылка ничего не делает» читалось бы как
// сломанная цитата, а не как отсутствующий просмотрщик.

import { useStore } from '@nanostores/react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { DocxViewer } from './DocxViewer'
import { MarkdownEditor } from './MarkdownEditor'
import { PdfViewer } from './PdfViewer'
import { SheetViewer } from './SheetViewer'
import { TextViewer } from './TextViewer'
import { ViewerHeader } from './ViewerHeader'
import {
  $activeTab,
  $openDocument,
  $tabs,
  closeTab,
  selectDocument,
  tabKey,
  type DocumentRequest
} from './viewer-store'

/** Раздача по расширению, а не по содержимому. Имя файла в цитате — то же имя,
 *  по которому документ разбирал индексатор, и расходиться этим двум взглядам
 *  на один файл нельзя. */
const BY_FORMAT: {
  match: RegExp
  render: (request: DocumentRequest) => React.JSX.Element | null
}[] = [
  { match: /\.pdf$/i, render: () => <PdfViewer /> },
  { match: /\.docx$/i, render: () => <DocxViewer /> },
  { match: /\.txt$/i, render: () => <TextViewer /> },
  { match: /\.(xlsx|csv)$/i, render: () => <SheetViewer /> },
  // .md правится, а не просматривается — но только в vault: файл источника
  // открывается на чтение, как и всё остальное там (SPEC UR2, AC6).
  {
    match: /\.(md|markdown)$/i,
    render: (request) => (request.sourceId ? <TextViewer /> : <MarkdownEditor />)
  }
]

function fileName(relPath: string): string {
  return relPath.split('/').pop() ?? relPath
}

function TabStrip(): React.JSX.Element | null {
  const t = useAecT()
  const tabs = useStore($tabs)
  const active = useStore($activeTab)

  // Одна вкладка — это просто открытый документ; полоса появляется, когда есть
  // из чего выбирать.
  if (tabs.length < 2) return null

  return (
    <div className="border-border flex items-stretch gap-0.5 overflow-x-auto border-b px-1 py-1">
      {tabs.map((tab) => {
        const key = tabKey(tab)
        return (
          <div
            className={
              key === active
                ? 'bg-muted text-foreground flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs'
                : 'text-muted-foreground hover:bg-muted/60 flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs'
            }
            key={key}
          >
            <button
              className="max-w-40 truncate"
              onClick={() => selectDocument(key)}
              title={tab.relPath}
              type="button"
            >
              {fileName(tab.relPath)}
            </button>
            <button
              aria-label={t('viewer.closeTab', fileName(tab.relPath))}
              className="hover:text-foreground opacity-60"
              onClick={() => closeTab(key)}
              type="button"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Unsupported({
  relPath,
  sourceId
}: {
  relPath: string
  sourceId?: string
}): React.JSX.Element {
  const t = useAecT()

  return (
    <div className="flex h-full flex-col">
      <ViewerHeader relPath={relPath} />
      <div className="text-muted-foreground space-y-3 p-4 text-sm">
        <p>{t('viewer.unsupported')}</p>
        <p className="text-foreground break-all">{relPath}</p>
        <Button
          onClick={() => {
            void (sourceId
              ? window.aecpilot.showSourceEntryInExplorer(sourceId, relPath)
              : window.aecpilot.showVaultEntryInExplorer(relPath))
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

export function DocumentViewer(): React.JSX.Element {
  const request = useStore($openDocument)
  // Пустой просмотрщик показывает PDF-вид: у него есть своё «кликните ссылку в
  // ответе», и заводить второй пустой экран не за чем.
  const format = request && BY_FORMAT.find((candidate) => candidate.match.test(request.relPath))

  return (
    <div className="flex h-full flex-col">
      <TabStrip />
      <div className="min-h-0 flex-1">
        {!request ? (
          <PdfViewer />
        ) : format ? (
          format.render(request)
        ) : (
          <Unsupported relPath={request.relPath} sourceId={request.sourceId} />
        )}
      </div>
    </div>
  )
}
