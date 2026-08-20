// `::aec-clause` — ссылка на пункт норматива, открывающая документ на месте
// (задача 3.4б, SPEC UR28). Разбор атрибутов — `blocks-pure.ts`.
//
// Зачем блок, если цитата в тексте и так кликается: в ответе про нормоконтроль
// пункт — это ВЫВОД, а не сноска. «п. 5.6.3 СП 22.13330» строкой в абзаце
// теряется среди слов, а инженеру нужно с него начать: открыть страницу и
// прочитать формулировку самому.

import { openDocument } from '../viewers/viewer-store'
import { useAecT } from '../../shared/i18n'

import { readClauseBlock, type DirectiveAttrs } from './blocks-pure'

export function ClauseBlockView({ attrs }: { attrs: DirectiveAttrs }): React.JSX.Element {
  const t = useAecT()
  const block = readClauseBlock(attrs)
  const source = block.source

  return (
    <div className="my-1.5 flex flex-col gap-1 rounded-[6px] border border-(--ui-stroke-secondary) bg-(--ui-bg-quaternary) p-2 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-(--ui-text-primary)">
          {block.clause ? t('blocks.clause', block.clause) : t('blocks.clauseNoNumber')}
        </span>
        {block.doc && <span className="truncate text-(--ui-text-secondary)">{block.doc}</span>}
      </div>

      {block.note && <p className="text-(--ui-text-secondary)">{block.note}</p>}

      {source ? (
        <button
          className="self-start rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-(--ui-text-secondary) transition-colors hover:text-(--ui-text-primary)"
          onClick={() =>
            openDocument({
              locator: source.locator,
              relPath: source.relPath,
              sourceId: source.sourceId
            })
          }
          type="button"
        >
          <span aria-hidden className="codicon codicon-book" /> {t('blocks.openAtPlace')}
        </button>
      ) : (
        // Ссылку агент не дал или дал неразборчиво. Молча показать блок без
        // кнопки — значит оставить человека гадать, почему она не появилась.
        <span className="text-(--ui-text-tertiary)">{t('blocks.noSource')}</span>
      )}
    </div>
  )
}
