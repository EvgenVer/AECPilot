// Pure logic behind the composer's model picker (task 1.6.9). No React, no
// IPC: flattening the gateway's provider catalogue, deciding which knobs a
// given model actually supports, and deciding whether a switch is allowed
// right now. Kept separate so all of it is testable under vitest's node
// project.

import type { ModelOptionProvider, ModelOptionsResult } from '../../../shared/gateway/types'

/** One selectable row in the picker. */
export interface ModelRow {
  /** What `config.set {key:'model'}` is given. Their `parse_model_flags`
   * understands a bare model id; the provider is resolved on their side. */
  value: string
  model: string
  providerSlug: string
  providerName: string
  /** True when this is what the agent is running right now. */
  current: boolean
  /** Rows the user cannot pick, with the reason shown next to them rather
   * than hidden — a model missing from the list with no explanation reads as
   * a bug. */
  disabledReason?: string
  supportsFast: boolean
  supportsReasoning: boolean
}

/** The reasoning levels their `parse_reasoning_effort` accepts, in the order
 * it documents them. `'none'` is the explicit "thinking off" — distinct from
 * omitting the setting, which means "provider default". */
export const REASONING_LEVELS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
] as const
export type ReasoningLevel = (typeof REASONING_LEVELS)[number]

export function isReasoningLevel(value: string): value is ReasoningLevel {
  return (REASONING_LEVELS as readonly string[]).includes(value)
}

const REASONING_LABELS: Record<ReasoningLevel, string> = {
  none: 'без рассуждений',
  minimal: 'минимальные',
  low: 'низкие',
  medium: 'средние',
  high: 'высокие',
  xhigh: 'очень высокие',
  max: 'максимальные'
}

/** Label for the effort the gateway reported. `''` is not a level — it means
 * the provider's own default, which we must not render as "none". */
export function reasoningLabel(effort: string): string {
  if (effort === '') return 'по умолчанию'
  return isReasoningLevel(effort) ? REASONING_LABELS[effort] : effort
}

function providerRows(provider: ModelOptionProvider, currentModel: string): ModelRow[] {
  const unavailable = new Set(provider.unavailable_models ?? [])
  return (provider.models ?? []).map((model) => {
    const capabilities = provider.capabilities?.[model]
    // An absent capabilities map is not "supports nothing": their side only
    // fills it when the picker asks for it, and an older gateway omits it
    // entirely. Treating absence as unsupported would hide both knobs on
    // every model. Absence = unknown = offer it and let their side refuse.
    const supportsFast = capabilities?.fast ?? true
    const supportsReasoning = capabilities?.reasoning ?? true

    let disabledReason: string | undefined
    if (provider.authenticated === false) {
      disabledReason =
        provider.auth_type === 'api_key'
          ? `нужен ключ ${provider.key_env ?? 'провайдера'}`
          : 'провайдер не настроен'
    } else if (unavailable.has(model)) {
      disabledReason = 'недоступна на текущем тарифе'
    }

    return {
      value: model,
      model,
      providerSlug: provider.slug,
      providerName: provider.name || provider.slug,
      current: model === currentModel,
      disabledReason,
      supportsFast,
      supportsReasoning
    }
  })
}

/** Flattens `model.options` into picker rows, preserving their order — their
 * handler already sorts providers into the display order they intend, so
 * re-sorting here would only disagree with the rest of their surfaces. */
export function toModelRows(options: ModelOptionsResult, currentModel: string): ModelRow[] {
  const model = currentModel || options.model || ''
  return (options.providers ?? []).flatMap((provider) => providerRows(provider, model))
}

/** What the picker's two knobs should do for the model in use. A model absent
 * from the catalogue (a custom endpoint, a stale list) leaves both offered —
 * refusing a knob on a model we simply do not know about would be a guess. */
export function knobsFor(
  rows: ModelRow[],
  model: string
): {
  fast: boolean
  reasoning: boolean
} {
  const row = rows.find((r) => r.model === model)
  return { fast: row?.supportsFast ?? true, reasoning: row?.supportsReasoning ?? true }
}

/** Why the model cannot be switched right now, or `undefined` when it can.
 *
 * Their `config.set {key:'model'}` returns error 4009 during an in-flight
 * turn, because `switch_model` mutates the live agent's model/provider/
 * base_url in place while the worker thread is reading them. Blocking the
 * control up front turns that into an explanation instead of an error. */
export function modelSwitchBlockedReason(args: {
  connected: boolean
  streaming: boolean
}): string | undefined {
  if (!args.connected) return 'нет связи со шлюзом'
  if (args.streaming) return 'идёт ход — сначала остановите его'
  return undefined
}

/** Short text for the composer's button. Shows the effort and the fast flag
 * only when they say something: the provider default and "not fast" are the
 * absence of a choice, and spelling them out would make every session look
 * configured. */
export function pickerSummary(runtime: {
  model: string
  reasoningEffort: string
  fast: boolean
}): string {
  const parts = [runtime.model || 'модель не выбрана']
  if (runtime.reasoningEffort !== '') parts.push(reasoningLabel(runtime.reasoningEffort))
  if (runtime.fast) parts.push('быстрый')
  return parts.join(' · ')
}
