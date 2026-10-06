// Первая строка окна выбора провайдера (D-174, решение владельца 2026-10-06):
// рекомендуем OpenAI по ключу, а не Nous Portal донора. Один ключ OpenAI годится
// и агенту, и индексу с памятью — человеку не придётся выбирать им провайдера
// отдельно, как при подписке (D-172). Строка регистрируется в их окне правкой
// [6] (`donor/components/onboarding/index.tsx`).

import { RowButton } from '../../donor/components/ui/row-button'
import { ChevronRight } from '../../donor/lib/icons'
import { useAecT } from '../../shared/i18n'

export function RecommendedKeyRow({ onClick }: { onClick: () => void }) {
  const t = useAecT()

  return (
    <RowButton
      className="group flex w-full items-center justify-between gap-3 rounded-[8px] bg-primary/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
      onClick={onClick}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--conversation-text-font-size)] font-semibold">
            {t('onboarding.recommendedKey.title')}
          </span>
          <span className="inline-flex items-center bg-primary px-2 py-0.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-primary-foreground">
            {t('onboarding.recommendedKey.badge')}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t('onboarding.recommendedKey.pitch')}
        </p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-primary transition group-hover:translate-x-0.5" />
    </RowButton>
  )
}
