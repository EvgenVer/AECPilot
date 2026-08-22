// Карточка специалиста: завести нового или поправить существующего (задача 3C.1).
//
// ИМЯ ПРОФИЛЯ НЕ МЕНЯЕТСЯ ПОСЛЕ СОЗДАНИЯ. Это не упрощение: имя — идентификатор
// каталога на машине ядра, к нему привязаны сессии, расписания и настройки.
// Переименование значило бы перенос всего этого; подпись на экране (`title`)
// меняется свободно и делает ровно то, чего человек ждёт от переименования.

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { SpecialistInputView } from '../../../../shared/ipc'

export interface SpecialistDraft {
  isNew: boolean
  input: SpecialistInputView
}

export function SpecialistDialog({
  busy,
  draft,
  onCancel,
  onChange,
  onSubmit
}: {
  busy: boolean
  draft: SpecialistDraft
  onCancel: () => void
  onChange: (draft: SpecialistDraft) => void
  onSubmit: () => void
}): React.JSX.Element {
  const t = useAecT()

  const set = (patch: Partial<SpecialistInputView>): void =>
    onChange({ ...draft, input: { ...draft.input, ...patch } })

  // Имя нового специалиста едет в имя каталога — проверяется здесь, чтобы
  // человек увидел отказ до отправки, и ещё раз в главном процессе, потому что
  // «окно проверило» основанием не является.
  const nameOk = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(draft.input.name)

  return (
    <div className="flex flex-col gap-2 rounded-[4px] bg-(--ui-bg-quaternary) p-2">
      <strong className="text-xs">{draft.isNew ? t('roster.create') : t('roster.edit')}</strong>

      {draft.isNew ? (
        <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
          {t('roster.name')}
          <input
            aria-label={t('roster.name')}
            className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
            onChange={(event) => set({ name: event.target.value })}
            value={draft.input.name}
          />
          {!nameOk && draft.input.name !== '' && (
            <span className="text-destructive">{t('roster.nameRule')}</span>
          )}
        </label>
      ) : (
        <span className="text-[11px] text-(--ui-text-secondary)">
          {t('roster.nameFixed', draft.input.name)}
        </span>
      )}

      <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        {t('roster.displayName')}
        <input
          aria-label={t('roster.displayName')}
          className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
          onChange={(event) => set({ title: event.target.value })}
          value={draft.input.title ?? ''}
        />
      </label>

      <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        {t('roster.role')}
        <input
          aria-label={t('roster.role')}
          className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
          onChange={(event) => set({ role: event.target.value })}
          value={draft.input.role ?? ''}
        />
      </label>

      <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        {t('roster.description')}
        <textarea
          aria-label={t('roster.description')}
          className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
          onChange={(event) => set({ description: event.target.value })}
          rows={2}
          value={draft.input.description ?? ''}
        />
      </label>

      <div className="flex justify-end gap-2">
        <Button disabled={busy} onClick={onCancel} size="sm" variant="text">
          {t('common.cancel')}
        </Button>
        <Button disabled={busy || (draft.isNew && !nameOk)} onClick={onSubmit} size="sm">
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
