// Расширенные возможности специалиста (задача 3C.2, SPEC UR27).
//
// Своя модель, свой SOUL, поштучный выбор скилов, тулсетов и MCP-серверов. Всё
// это ядро умеет одним вызовом `profiles.configure` — и применяет РАЗДЕЛАМИ,
// каждый сам по себе. Поэтому и на экране это разделы, а не одна кнопка
// «сохранить всё»: неудача одного из них не должна выглядеть как общая неудача,
// а успех остальных — как общий успех.
//
// ЧЕГО ЗДЕСЬ НЕТ: «наследовать модель». Ядро 0.20.4 назначение модели только
// ПИШЕТ (`_write_profile_model`, и только парой провайдер+модель); снять его
// нечем — публичной поверхности для этого нет. Их плагин такую кнопку рисует,
// мы её не рисуем: кнопка, которая ничего не делает, хуже её отсутствия. Пока
// специалисту модель не назначена, он и так берёт общую.

import { useQuery } from '@tanstack/react-query'

import { useAecT } from '../../shared/i18n'
import type { SpecialistInputView } from '../../../../shared/ipc'

export function AdvancedSpecialist({
  input,
  onChange
}: {
  input: SpecialistInputView
  onChange: (patch: Partial<SpecialistInputView>) => void
}): React.JSX.Element {
  const t = useAecT()

  const { data: models } = useQuery({
    queryKey: ['aec', 'roster', 'models'],
    queryFn: () => window.aecpilot.getModelOptions(),
    staleTime: 5 * 60 * 1000
  })

  const { data: skills } = useQuery({
    queryKey: ['aec', 'roster', 'skills'],
    queryFn: () => window.aecpilot.listSkills(),
    staleTime: 60 * 1000
  })

  const { data: toolsets } = useQuery({
    queryKey: ['aec', 'roster', 'toolsets'],
    queryFn: () => window.aecpilot.listToolsets(),
    staleTime: 60 * 1000
  })

  // Провайдеры без доступов показываются серыми, но выбрать их нельзя: без
  // ключа специалист не ответит ни разу, и узнать об этом на первом же вопросе —
  // худший момент.
  const providers = (models?.providers ?? []).filter((provider) => provider.authenticated !== false)

  const disabled = new Set(input.disabledSkills ?? [])
  const enabledToolsets = new Set(input.enabledToolsets ?? [])

  return (
    <div className="flex flex-col gap-2 border-t border-(--ui-stroke-secondary) pt-2">
      <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        {t('roster.model')}
        <select
          aria-label={t('roster.model')}
          className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
          onChange={(event) => {
            const [provider, model] = event.target.value.split(' ')
            onChange({ provider, model })
          }}
          value={`${input.provider ?? ''} ${input.model ?? ''}`}
        >
          <option value=" ">{t('roster.modelInherited')}</option>
          {providers.flatMap((provider) =>
            (provider.models ?? []).map((model) => (
              <option key={`${provider.slug}/${model}`} value={`${provider.slug} ${model}`}>
                {provider.name} · {model}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        {t('roster.soul')}
        <textarea
          aria-label={t('roster.soul')}
          className="rounded-[4px] bg-(--ui-bg-tertiary) px-2 py-1 text-xs text-(--ui-text-primary)"
          onChange={(event) => onChange({ soul: event.target.value })}
          placeholder={t('roster.soulHint')}
          rows={4}
          value={input.soul ?? ''}
        />
      </label>

      <fieldset className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        <legend>{t('roster.skills')}</legend>
        {(skills ?? []).map((skill) => (
          <label className="flex items-center gap-1" key={skill.name}>
            <input
              checked={!disabled.has(skill.name)}
              onChange={(event) => {
                const next = new Set(disabled)
                if (event.target.checked) next.delete(skill.name)
                else next.add(skill.name)
                onChange({ disabledSkills: [...next] })
              }}
              type="checkbox"
            />
            {skill.name}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-0.5 text-[11px] text-(--ui-text-secondary)">
        <legend>{t('roster.toolsets')}</legend>
        {(toolsets?.toolsets ?? []).map((toolset) => (
          <label className="flex items-center gap-1" key={toolset.name}>
            <input
              checked={enabledToolsets.size === 0 || enabledToolsets.has(toolset.name)}
              onChange={(event) => {
                // Пустой список у ядра значит «все включены». Первый снятый
                // флажок поэтому превращает «все» в явный список без него —
                // иначе снятие ничего бы не изменило.
                const base =
                  enabledToolsets.size === 0
                    ? new Set((toolsets?.toolsets ?? []).map((row) => row.name))
                    : new Set(enabledToolsets)
                if (event.target.checked) base.add(toolset.name)
                else base.delete(toolset.name)
                onChange({ enabledToolsets: [...base] })
              }}
              type="checkbox"
            />
            {toolset.name}
          </label>
        ))}
      </fieldset>
    </div>
  )
}
