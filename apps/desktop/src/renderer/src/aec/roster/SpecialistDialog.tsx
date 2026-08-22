// Карточка специалиста: завести нового или поправить существующего (задача 3C.1).
//
// ИМЯ ПРОФИЛЯ НЕ МЕНЯЕТСЯ ПОСЛЕ СОЗДАНИЯ. Это не упрощение: имя — идентификатор
// каталога на машине ядра, к нему привязаны сессии, расписания и настройки.
// Переименование значило бы перенос всего этого; подпись на экране (`title`)
// меняется свободно и делает ровно то, чего человек ждёт от переименования.

import { useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type {
  SpecialistFaceView,
  SpecialistInputView,
  SpecialistView
} from '../../../../shared/ipc'

import { AdvancedSpecialist } from './AdvancedSpecialist'
import { SpecialistRoutines } from './SpecialistRoutines'

export interface SpecialistDraft {
  isNew: boolean
  input: SpecialistInputView
}

/** Формы и цвета лица (задача 3C.3). Список закрытый и короткий: выбор из
 * четырёх форм и восьми цветов человек делает за секунду, а палитра на 16
 * миллионов оттенков — это работа, которой он не просил.
 *
 * ПИТОМЦА И ГЕНЕРАЦИИ ПОРТРЕТА ЗДЕСЬ НЕТ И НЕ БУДЕТ: SPEC HX1 и HX11. */
const SHAPES: SpecialistFaceView['shape'][] = ['circle', 'square', 'hex', 'diamond']
const COLORS = [
  '#5B8DEF',
  '#22A06B',
  '#C9721A',
  '#B4406B',
  '#7A5AF8',
  '#0F8B8D',
  '#B03A2E',
  '#5A6472'
]

export function SpecialistDialog({
  busy,
  draft,
  onCancel,
  onChange,
  onPickPicture,
  onSubmit,
  roster
}: {
  busy: boolean
  draft: SpecialistDraft
  onCancel: () => void
  onChange: (draft: SpecialistDraft) => void
  onPickPicture?: () => void
  onSubmit: () => void
  roster?: SpecialistView[]
}): React.JSX.Element {
  const t = useAecT()
  const [advanced, setAdvanced] = useState(false)

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

      <div className="flex flex-col gap-1 text-[11px] text-(--ui-text-secondary)">
        {t('roster.face')}
        <div className="flex gap-1">
          {SHAPES.map((shape) => (
            <button
              aria-label={shape}
              aria-pressed={draft.input.face?.shape === shape}
              className={`h-5 w-5 border ${
                draft.input.face?.shape === shape
                  ? 'border-(--ui-text-primary)'
                  : 'border-transparent'
              }`}
              key={shape}
              onClick={() => set({ face: { shape, color: draft.input.face?.color ?? COLORS[0] } })}
              style={{ backgroundColor: draft.input.face?.color ?? COLORS[0] }}
              type="button"
            />
          ))}
          <Button
            aria-label={t('roster.faceNone')}
            onClick={() => set({ face: null })}
            size="icon-xs"
            title={t('roster.faceNone')}
            variant="ghost"
          >
            ×
          </Button>
          {/* Картинка живёт не в этой форме: она уходит на сервер сразу и
              отдельно (`profiles.set_asset`), потому что весит больше, чем
              помещается в метаданные. У нового специалиста профиля ещё нет —
              значит и класть картинку некуда. */}
          {!draft.isNew && onPickPicture && (
            <Button onClick={onPickPicture} size="sm" variant="text">
              {t('roster.facePicture')}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((color) => (
            <button
              aria-label={color}
              className={`h-4 w-4 rounded-full border ${
                draft.input.face?.color === color
                  ? 'border-(--ui-text-primary)'
                  : 'border-transparent'
              }`}
              key={color}
              onClick={() => set({ face: { shape: draft.input.face?.shape ?? 'circle', color } })}
              style={{ backgroundColor: color }}
              type="button"
            />
          ))}
        </div>
      </div>

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

      {draft.isNew && (roster?.length ?? 0) > 0 && (
        <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
          {t('roster.cloneFrom')}
          <select
            aria-label={t('roster.cloneFrom')}
            className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
            onChange={(event) => set({ cloneFrom: event.target.value })}
            value={draft.input.cloneFrom ?? ''}
          >
            <option value="">{t('roster.cloneNone')}</option>
            {(roster ?? []).map((source) => (
              <option key={source.name} value={source.name}>
                {source.title.trim() === '' ? source.name : source.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <Button onClick={() => setAdvanced((on) => !on)} size="sm" variant="text">
        {t('roster.advanced')}
      </Button>

      {advanced && <AdvancedSpecialist input={draft.input} onChange={set} />}

      {/* Рутины — у существующего специалиста: у нового ещё нет профиля, а
          значит и расписанию не к кому привязаться. */}
      {!draft.isNew && <SpecialistRoutines profile={draft.input.name} />}

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
