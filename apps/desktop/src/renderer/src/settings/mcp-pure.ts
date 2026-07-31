// Pure logic behind the "MCP-серверы" section (task 1.6.B2.8).
//
// The screen has two sources that do not line up: the CONFIGURATION comes from
// their REST surface (there are no `mcp.*` RPC methods), and the LIVE state
// rides on `session.info.mcp_servers`. Merging them is the whole job, and both
// asymmetries are real: a server can be configured and never started (no live
// row yet), and a live row can name a server that was just deleted from the
// config.

import type { McpLiveStatus, McpServerSummary } from '../../../shared/ipc'

/** The name of the MCP server this app registers for the open project. Shown
 * as ours so that switching it off does not look like an ordinary third-party
 * server going away — it is how the agent sees the project's sources. */
export const OUR_MCP_SERVER = 'aec-sources'

export type McpRowStatus = 'connected' | 'connecting' | 'failed' | 'disabled' | 'configured'

export interface McpRow {
  name: string
  transport: string
  /** `enabled: false` in config — a deliberate off, not a failure. */
  enabled: boolean
  status: McpRowStatus
  /** Tool count from the live status; `undefined` when the server has never
   * been connected in this gateway process, which is not the same as zero. */
  toolCount?: number
  error?: string
  url?: string
  command?: string
  args: string[]
  /** Names only — the values never leave the main process. */
  envNames: string[]
  /** True when this row exists only in the live status: configured under a
   * different profile, or removed from config since the agent started. */
  liveOnly: boolean
  ours: boolean
}

const KNOWN_STATUSES: McpRowStatus[] = [
  'connected',
  'connecting',
  'failed',
  'disabled',
  'configured'
]

function normalizeStatus(raw: string | undefined, enabled: boolean): McpRowStatus {
  if (raw && (KNOWN_STATUSES as string[]).includes(raw)) return raw as McpRowStatus
  // No live row at all: the process has not tried this server yet. That is
  // "configured", not "failed" — calling it failed would invent an error.
  return enabled ? 'configured' : 'disabled'
}

/** Merges configuration with live status into one row per server. */
export function toMcpRows(
  servers: McpServerSummary[] | undefined,
  live: McpLiveStatus[] | undefined
): McpRow[] {
  const liveByName = new Map((live ?? []).map((entry) => [entry.name, entry]))
  const rows: McpRow[] = (servers ?? []).map((server) => {
    const status = liveByName.get(server.name)
    liveByName.delete(server.name)
    const enabled = server.enabled !== false
    return {
      name: server.name,
      transport: server.transport || (server.url ? 'http' : server.command ? 'stdio' : 'unknown'),
      enabled,
      status: normalizeStatus(status?.status, enabled),
      toolCount: typeof status?.tools === 'number' ? status.tools : undefined,
      error: status?.error,
      url: server.url ?? undefined,
      command: server.command ?? undefined,
      args: server.args ?? [],
      envNames: server.envNames ?? [],
      liveOnly: false,
      ours: server.name === OUR_MCP_SERVER
    }
  })

  // Whatever is left in the live map is running (or failing) without a config
  // entry we can see. Hiding it would leave a connected server invisible.
  for (const status of liveByName.values()) {
    rows.push({
      name: status.name,
      transport: status.transport ?? 'unknown',
      enabled: status.disabled !== true,
      status: normalizeStatus(status.status, status.disabled !== true),
      toolCount: typeof status.tools === 'number' ? status.tools : undefined,
      error: status.error,
      args: [],
      envNames: [],
      liveOnly: true,
      ours: status.name === OUR_MCP_SERVER
    })
  }

  return rows
}

export const MCP_STATUS_LABELS: Record<McpRowStatus, string> = {
  connected: 'подключён',
  connecting: 'подключается',
  failed: 'ошибка подключения',
  disabled: 'выключен',
  configured: 'настроен, ещё не подключался'
}

/** What turning this server off costs, in words — or `undefined` when nothing
 * special needs saying. Only our own server gets a warning: switching it off
 * is how the agent loses sight of the project's sources, which reads as the
 * agent "forgetting" the project rather than as a setting. */
export function disableWarning(row: McpRow): string | undefined {
  if (!row.ours) return undefined
  return 'Это наш сервер источников проекта: без него агент перестанет видеть подключённые источники.'
}
