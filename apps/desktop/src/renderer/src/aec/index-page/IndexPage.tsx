// Страница «Индекс» в основной области (задача 3H.8, SPEC UR43).
//
// Шапка — та же полоса, что у их страниц (`PageSearchShell`): отступ на высоту
// заголовка окна, иначе кнопки окна ложатся на текст. Поиска и вкладок у
// страницы пока нет — искать в сводке нечего; список файлов и ход по страницам
// добавит задача 3H.19.

import { useAecT } from '../../shared/i18n'
import { IndexDetails } from '../index-status/IndexStatus'

export default function IndexPage(): React.JSX.Element {
  const t = useAecT()

  return (
    <section
      aria-label={t('index.title')}
      className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)"
    >
      <div className="shrink-0 px-6 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)]">
        <h1 className="text-base font-semibold text-(--ui-text-primary)">{t('index.title')}</h1>
        <p className="text-xs text-(--ui-text-secondary)">{t('index.pageHint')}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="max-w-2xl">
          <IndexDetails />
        </div>
      </div>
    </section>
  )
}
