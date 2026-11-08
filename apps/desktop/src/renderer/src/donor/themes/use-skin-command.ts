/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/use-skin-command.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useCallback } from 'react'

import { useTheme } from './context'

// Old names land on a shipped theme so muscle memory works. `gold`/`hermes`
// only ever meant the classic gold look, so they reach Classic Hermes; `default`
// stays Nous because it is also the stock config value, which Desktop reads as
// "the Desktop default" everywhere else (boot, backend sync, setTheme).
const ALIASES: Record<string, string> = {
  ares: 'ember',
  default: 'nous',
  gold: 'classic',
  hermes: 'classic',
  'nous-light': 'nous'
}

export function useSkinCommand() {
  const { availableThemes, setTheme, themeName } = useTheme()

  return useCallback(
    (rawArg: string) => {
      const arg = rawArg.trim()

      if (!availableThemes.length) {
        return 'No desktop themes are available.'
      }

      const activeIndex = Math.max(
        0,
        availableThemes.findIndex(t => t.name === themeName)
      )

      if (!arg || arg === 'next') {
        const next = availableThemes[(activeIndex + 1) % availableThemes.length]
        setTheme(next.name)

        return `Desktop theme switched to ${next.label}.`
      }

      if (arg === 'list' || arg === 'ls' || arg === 'status') {
        const rows = availableThemes.map(t => `${t.name === themeName ? '*' : ' '} ${t.name.padEnd(10)} ${t.label}`)

        return ['Desktop themes:', ...rows, '', 'Use /skin <name>, or /skin to cycle.'].join('\n')
      }

      const normalized = arg.toLowerCase()
      const targetName = ALIASES[normalized] || normalized

      const target = availableThemes.find(
        t => t.name.toLowerCase() === targetName || t.label.toLowerCase() === normalized
      )

      if (!target) {
        return `Unknown desktop theme: ${arg}\nAvailable: ${availableThemes.map(t => t.name).join(', ')}`
      }

      setTheme(target.name)

      return `Desktop theme switched to ${target.label}.`
    },
    [availableThemes, setTheme, themeName]
  )
}
