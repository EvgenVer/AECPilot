// Шапка просмотрщика: имя файла и крестик (задача 4.2).
//
// Отдельным файлом, потому что её носят три просмотрщика и заглушка
// неподдержанного формата, а расходиться им нельзя: крестик, который в одном
// формате закрывает вкладку, а в другом стоит в другом углу, читается как
// разные приложения.

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { closeDocument } from './viewer-store'

export function ViewerHeader({
  children,
  relPath
}: {
  /** Кнопки конкретного формата — встают между именем и крестиком. */
  children?: React.ReactNode
  relPath: string
}): React.JSX.Element {
  const t = useAecT()

  return (
    <div className="border-border flex items-center gap-2 border-b px-3 py-2">
      <span className="truncate text-sm font-medium" title={relPath}>
        {relPath.split('/').pop()}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {children}
        <Button aria-label={t('viewer.close')} onClick={closeDocument} size="sm" variant="ghost">
          ✕
        </Button>
      </div>
    </div>
  )
}
