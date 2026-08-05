/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/mcp-tool-filter.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Per-tool MCP gating. A server's optional `tools.include` (whitelist) /
// `tools.exclude` (denylist) decide which discovered tools the agent registers
// — `include` wins, no filter means all. Mirrors `_register_server_tools` in
// `tools/mcp_tool.py`.

export interface McpToolsFilter {
  exclude?: string[]
  include?: string[]
}

type ServerConfig = Record<string, unknown>

const asNames = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined

const toolsObject = (server: ServerConfig | null | undefined): Record<string, unknown> => {
  const tools = server?.tools

  return tools && typeof tools === 'object' && !Array.isArray(tools) ? (tools as Record<string, unknown>) : {}
}

export function readToolsFilter(server: ServerConfig | null | undefined): McpToolsFilter {
  const tools = toolsObject(server)

  return { exclude: asNames(tools.exclude), include: asNames(tools.include) }
}

export function isToolEnabled(server: ServerConfig | null | undefined, name: string): boolean {
  const { exclude, include } = readToolsFilter(server)

  return include?.length ? include.includes(name) : !exclude?.includes(name)
}

// Toggle one tool, preserving the config's mode (include if present, else an
// exclude denylist). Empty lists — and an emptied `tools` — are dropped.
export function toggleToolInServer(server: ServerConfig, name: string): ServerConfig {
  const { exclude, include } = readToolsFilter(server)
  const key = include?.length ? 'include' : 'exclude'
  const current = (key === 'include' ? include : exclude) ?? []
  const names = current.includes(name) ? current.filter(n => n !== name) : [...current, name]
  const tools = { ...toolsObject(server) }

  if (names.length) {
    tools[key] = names
  } else {
    delete tools[key]
  }

  const next = { ...server }

  if (Object.keys(tools).length) {
    next.tools = tools
  } else {
    delete next.tools
  }

  return next
}

export const countEnabledTools = (server: ServerConfig | null | undefined, names: string[]): number =>
  names.filter(name => isToolEnabled(server, name)).length
