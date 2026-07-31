// Pure logic behind the settings screen's "Провайдеры и модели" section
// (task 1.6.B2.4). No React, no IPC — the section is a thin shell over this.
//
// The catalogue itself comes from `model.options`, the same call the composer's
// picker uses; this module answers a different question about it. The picker
// asks "which model do I switch to"; this section asks "which providers are
// actually usable, and why not".

import type { ModelOptionsResult, RuntimeCheckResult } from '../../../shared/gateway/types'

/** Three states, deliberately not two.
 *
 * `warned` is a provider that IS authenticated but came back with a `warning`
 * from their setup hints (an expiring credential, a deprecated endpoint, a
 * misconfigured base URL). Collapsing it into `connected` hides the one thing
 * the user could act on before a turn fails; collapsing it into `disconnected`
 * would claim their key does not work when it does. */
export type ProviderConnection = 'connected' | 'warned' | 'disconnected'

export interface ProviderRow {
  slug: string
  name: string
  connection: ProviderConnection
  /** True for the provider serving the agent right now. */
  current: boolean
  modelCount: number
  models: string[]
  /** One line explaining a non-`connected` state: the warning text as their
   * side worded it, or what activating the provider would take. Never
   * invented — a provider with no explanation gets none. */
  hint?: string
}

/** How an unconfigured provider would be activated, in words.
 *
 * Only `api_key` is something a user can act on inside this app (the "Доступы"
 * section stores one). Everything else — OAuth device flows, `gh auth`, AWS
 * IAM — happens in their CLI, so the row says which, rather than offering a
 * button that cannot exist here. */
function activationHint(authType: string | undefined, keyEnv: string | undefined): string {
  if (authType === 'api_key') {
    return keyEnv ? `нужен ключ (${keyEnv}) — раздел «Доступы»` : 'нужен ключ — раздел «Доступы»'
  }
  if (authType === 'oauth') return 'подключается через вход у провайдера (вне приложения)'
  if (authType === 'cli') return 'подключается командой их CLI (вне приложения)'
  if (authType) return `подключается способом «${authType}» (вне приложения)`
  return 'провайдер не настроен'
}

/** Rows in the order the gateway sent them.
 *
 * Not sorted here on purpose: their handler already applies `canonical_order`
 * (CANONICAL_PROVIDERS declaration order, truly-custom rows last), and every
 * other hermes surface shows that order. Re-sorting would make this screen the
 * only one that disagrees. */
export function toProviderRows(options: ModelOptionsResult): ProviderRow[] {
  const currentSlug = (options.provider ?? '').toLowerCase()
  return (options.providers ?? []).map((provider) => {
    const authenticated = provider.authenticated !== false
    const warning = (provider.warning ?? '').trim()
    const connection: ProviderConnection = !authenticated
      ? 'disconnected'
      : warning !== ''
        ? 'warned'
        : 'connected'
    const models = provider.models ?? []
    return {
      slug: provider.slug,
      name: provider.name || provider.slug,
      connection,
      current: provider.is_current === true || provider.slug.toLowerCase() === currentSlug,
      modelCount: models.length,
      models,
      hint:
        connection === 'disconnected'
          ? activationHint(provider.auth_type, provider.key_env)
          : connection === 'warned'
            ? warning
            : undefined
    }
  })
}

/** The section's header verdict.
 *
 * `setup.runtime_check` answers the question the provider list cannot: would a
 * prompt sent right now actually reach a model. The two failures it separates
 * matter — "no credentials for X" is a different fix from "X is configured but
 * this model is not served by it" — so the message is theirs, verbatim, with
 * the provider named. `undefined` means all good and nothing is drawn: a
 * standing green banner would train the user to ignore the spot where the real
 * warning appears. */
export function runtimeVerdict(
  check: RuntimeCheckResult | undefined
): { provider: string; message: string } | undefined {
  if (!check || check.ok) return undefined
  return {
    provider: check.provider ?? 'провайдер не определён',
    message: (check.error ?? '').trim() || 'ядро не смогло подобрать рабочего провайдера'
  }
}

export const PROVIDER_STATUS_LABELS: Record<ProviderConnection, string> = {
  connected: 'подключён',
  warned: 'подключён, есть предупреждение',
  disconnected: 'не подключён'
}
