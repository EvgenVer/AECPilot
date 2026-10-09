// Страница «Индекс» в основной области (задача 3H.8, SPEC UR43).
//
// Шапка — та же полоса, что у их страниц (`PageSearchShell`): отступ на высоту
// заголовка окна, иначе кнопки окна ложатся на текст. Поиска и вкладок у
// страницы пока нет — искать в сводке нечего; список файлов и ход по страницам
// добавит задача 3H.19.

import { useState } from 'react'

import { useAecT } from '../../shared/i18n'
import { IndexGraph } from '../index-graph/IndexGraph'
import { IndexDetails } from '../index-status/IndexStatus'

type Tab = 'graph' | 'overview'

export default function IndexPage(): React.JSX.Element {
  const t = useAecT()
  // Задача 3J.14: граф — своя вкладка; WebGL рисуется, только когда её открыли.
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <section
      aria-label={t('index.title')}
      className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)"
    >
      <div className="shrink-0 px-6 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)]">
        <h1 className="text-base font-semibold text-(--ui-text-primary)">{t('index.title')}</h1>
        <p className="text-xs text-(--ui-text-secondary)">{t('index.pageHint')}</p>
        <div className="mt-2 flex gap-1" role="tablist">
          {(['overview', 'graph'] as const).map((name) => (
            <button
              aria-selected={tab === name}
              className={`rounded px-2 py-0.5 text-xs ${
                tab === name
                  ? 'bg-(--ui-control-active-background) text-(--ui-text-primary)'
                  : 'text-(--ui-text-secondary) hover:text-(--ui-text-primary)'
              }`}
              key={name}
              onClick={() => setTab(name)}
              role="tab"
              type="button"
            >
              {t(`index.tabs.${name}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        {tab === 'overview' ? (
          <div className="max-w-2xl">
            <IndexDetails />
          </div>
        ) : (
          <IndexGraph />
        )}
      </div>
    </section>
  )
}
