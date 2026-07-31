// Pure logic behind the settings screen's "Инструменты" section (tasks
// 1.6.B2.6 read / 1.6.B2.7 write).
//
// Two things live here because both are easy to get subtly wrong: how an
// absent `enabled` signal is read, and how the three outcome lists of
// `tools.configure` turn into one honest sentence.

import type {
  ToolsConfigureResult,
  ToolsetInfo,
  ToolsListResult
} from '../../../shared/gateway/types'

export interface ToolsetRow {
  name: string
  description: string
  toolCount: number
  enabled: boolean
  tools: string[]
}

/** Normalizes `tools.list` into rows.
 *
 * The `enabled` rule is theirs and is inverted from the obvious reading:
 * `name in enabled if enabled else True` — an EMPTY enabled-set means every
 * toolset is on (no restriction configured), not that all are off. Their
 * handler already applies it, so a missing/undefined `enabled` field here can
 * only mean an older gateway that did not send one; reading that as "off"
 * would show a fully-working agent as having no tools at all. */
export function toToolsetRows(result: ToolsListResult | undefined): ToolsetRow[] {
  const toolsets: ToolsetInfo[] = result?.toolsets ?? []
  return toolsets
    .filter((toolset) => typeof toolset?.name === 'string' && toolset.name !== '')
    .map((toolset) => ({
      name: toolset.name,
      description: toolset.description ?? '',
      toolCount:
        typeof toolset.tool_count === 'number' ? toolset.tool_count : (toolset.tools ?? []).length,
      enabled: toolset.enabled !== false,
      tools: Array.isArray(toolset.tools) ? toolset.tools : []
    }))
}

/** The wording of the confirmation shown before enabling a toolset.
 *
 * Enabling grants the agent capabilities it did not have; the honest way to
 * ask is to name them. A toolset whose tool list did not arrive says how many
 * instead of pretending to list them. */
export function describeEnableConfirmation(row: ToolsetRow): string {
  if (row.tools.length > 0) {
    return `Агент получит инструменты: ${row.tools.join(', ')}.`
  }
  return `Агент получит ${row.toolCount} инструментов этого набора.`
}

export interface ConfigureOutcome {
  /** True when at least one requested name actually took effect. */
  applied: boolean
  message: string
  /** Shown apart from `message`: the live agent was rebuilt, which drops
   * whatever state it had accumulated this turn. */
  agentReset: boolean
}

/** Turns `tools.configure`'s answer into one sentence, without merging the
 * three lists it returns.
 *
 * They mean genuinely different things:
 * - `changed` — took effect
 * - `unknown` — their registry has no such toolset (a stale list on our side)
 * - `missing_servers` — an MCP server named in the request is configured but
 *   not currently connected, so its tools could not be touched
 *
 * A single "не удалось" for all three would leave the user with no idea which
 * of "reload the list", "start the server" or "nothing to do" applies. */
export function describeConfigureOutcome(
  result: ToolsConfigureResult,
  action: 'enable' | 'disable'
): ConfigureOutcome {
  const changed = result.changed ?? []
  const unknown = result.unknown ?? []
  const missing = result.missing_servers ?? []
  const verb = action === 'enable' ? 'включены' : 'выключены'

  const parts: string[] = []
  if (changed.length > 0) parts.push(`${verb}: ${changed.join(', ')}`)
  if (unknown.length > 0) parts.push(`ядро не знает таких наборов: ${unknown.join(', ')}`)
  if (missing.length > 0) {
    parts.push(`MCP-серверы не подключены, их инструменты не тронуты: ${missing.join(', ')}`)
  }
  if (parts.length === 0) parts.push('ядро не сообщило ни об одном изменении')

  return {
    applied: changed.length > 0,
    message: parts.join('; '),
    agentReset: result.reset === true
  }
}

/** Warning text for the case above — separate from the outcome message
 * because it is about the CURRENT conversation, not about the setting. */
export const AGENT_RESET_NOTICE =
  'Агент текущей сессии пересобран — накопленное им состояние хода сброшено.'
