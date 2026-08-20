// `::aec-conflict` — карточка расхождения (задача 3.4б, SPEC UR28).
//
// Главный предмет сценария G4: два документа говорят про одно и то же разное.
// Абзацем это читается как рассуждение, карточкой — как факт: предмет сверху,
// две стороны рядом, у каждой своё значение и свой источник, который
// открывается на нужном месте.
//
// Задача 3.4в: у карточки есть обратный канал к агенту — «разобрать подробнее».
// Он идёт их обычным путём отправки, БЕЗ пометки скрытого хода, поэтому вопрос
// появляется в переписке как обычное сообщение (SPEC AC13, риск R19). Снятие
// пометки со всех остальных путей — `visible-turns.ts`.

import { requestComposerSubmit } from '../../donor/app/chat/composer/focus'
import { openDocument } from '../viewers/viewer-store'
import { useAecT } from '../../shared/i18n'

import {
  conflictIsEmpty,
  readConflictBlock,
  type ConflictSide,
  type DirectiveAttrs
} from './blocks-pure'

function Side({ side }: { side: ConflictSide }): React.JSX.Element {
  const t = useAecT()

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="truncate text-(--ui-text-tertiary)">{side.label}</span>
      <span className="font-mono text-sm text-(--ui-text-primary)">
        {side.value || t('blocks.noValue')}
      </span>
      {side.source && (
        <button
          className="self-start truncate text-(--ui-text-secondary) underline decoration-dotted underline-offset-2 transition-colors hover:text-(--ui-text-primary)"
          onClick={() =>
            openDocument({
              locator: side.source!.locator,
              relPath: side.source!.relPath,
              sourceId: side.source!.sourceId
            })
          }
          type="button"
        >
          {side.source.relPath.split('/').pop()}
        </button>
      )}
    </div>
  )
}

export function ConflictBlockView({ attrs }: { attrs: DirectiveAttrs }): React.JSX.Element | null {
  const t = useAecT()
  const block = readConflictBlock(attrs, {
    left: t('blocks.sideLeft'),
    right: t('blocks.sideRight')
  })

  // Ни одного значения — показывать нечего; пустая рамка на месте абзаца хуже
  // самого абзаца. Возврат null отдаёт абзац обратно их разметке.
  if (conflictIsEmpty(block)) return null

  return (
    <div className="my-1.5 flex flex-col gap-2 rounded-[6px] border border-amber-500/50 bg-amber-500/5 p-2 text-xs">
      <div className="flex items-center gap-1.5 text-(--ui-text-primary)">
        <span aria-hidden className="codicon codicon-warning text-amber-600 dark:text-amber-400" />
        <span className="font-semibold">{block.subject || t('blocks.conflict')}</span>
      </div>

      <div className="flex gap-3">
        <Side side={block.left} />
        <div className="w-px shrink-0 bg-(--ui-stroke-secondary)" />
        <Side side={block.right} />
      </div>

      <button
        className="self-start rounded border border-(--ui-stroke-secondary) px-1.5 py-0.5 text-(--ui-text-secondary) transition-colors hover:text-(--ui-text-primary)"
        onClick={() =>
          requestComposerSubmit(
            t(
              'blocks.askConflict',
              block.subject || t('blocks.conflict'),
              block.left.label,
              block.left.value || t('blocks.noValue'),
              block.right.label,
              block.right.value || t('blocks.noValue')
            )
          )
        }
        type="button"
      >
        {t('blocks.ask')}
      </button>
    </div>
  )
}
