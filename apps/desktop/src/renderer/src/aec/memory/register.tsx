// Где человек находит память агента (задача 5.4).
//
// В СТРОКЕ СОСТОЯНИЯ, рядом с проектом и индексом, и по той же причине: память
// влияет на КАЖДЫЙ ответ — её текст уезжает в промпт каждого хода, — значит она
// относится к «на чём стоит этот ответ», а не к настройкам, куда заходят раз в
// месяц. Соседи там те же по смыслу: какой проект открыт и прочитан ли он.
//
// ЧИТАЕТСЯ ПРИ ОТКРЫТИИ ОКНА, а не при запуске: записку пишет и сам агент своим
// инструментом, и показать устаревший текст значит предложить затереть его правку.

import { registry } from '../../donor/contrib/registry'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { useAecT } from '../../shared/i18n'

import MemoryDialog from './MemoryDialog'
import { openMemoryScreen } from './store'

function MemoryBadge(): React.JSX.Element {
  const t = useAecT()

  return (
    <button
      className="text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
      onClick={openMemoryScreen}
      title={t('memoryScreen.badgeHint')}
      type="button"
    >
      {t('memoryScreen.badge')}
    </button>
  )
}

export function registerMemoryScreen(): void {
  registry.register({
    id: 'aec-memory',
    area: STATUSBAR_AREAS.left,
    source: 'core',
    order: -93,
    render: () => <MemoryBadge />
  })

  registry.register({
    id: 'aec-memory-dialog',
    area: STATUSBAR_AREAS.left,
    source: 'core',
    order: -92,
    render: () => <MemoryDialog />
  })
}
