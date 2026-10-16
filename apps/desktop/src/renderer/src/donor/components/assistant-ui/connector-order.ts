/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/connector-order.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The onboarding apps step's order: the most used apps lead; apps turned off and a hidden few are left out.
const CONNECTOR_LEAD_ORDER = [
  'gmail',
  'googlecalendar',
  'googledrive',
  'googledocs',
  'googlesheets',
  'outlook',
  'slack',
  'notion',
  'linear',
  'jira',
  'figma',
  'todoist'
]

const CONNECTOR_PICKER_HIDDEN = new Set(['discord', 'discordbot', 'microsoft_teams'])

export function orderConnectorPicks<T extends { connector: string; enabled?: boolean }>(rows: T[]): T[] {
  const rank = new Map(CONNECTOR_LEAD_ORDER.map((slug, index) => [slug, index]))

  return rows
    .filter(row => row.enabled !== false && !CONNECTOR_PICKER_HIDDEN.has(row.connector))
    .sort((a, b) => {
      const ra = rank.get(a.connector) ?? Number.POSITIVE_INFINITY
      const rb = rank.get(b.connector) ?? Number.POSITIVE_INFINITY

      return ra - rb || a.connector.localeCompare(b.connector)
    })
}
