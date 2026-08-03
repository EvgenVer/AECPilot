// Pure half of the profiles surface (task 1.6.B5.23) — parsing and the two
// refusals, kept away from `fetch` so both are pinned by node tests.
//
// Profiles are the batch's only REST surface: there are no `profile.*` methods
// in tui_gateway at all (owner decision B5-1=C, allowed by rule R1). Every
// shape below was MEASURED by `runtime/profiles-probe.mjs` against a live
// `hermes serve`, not read off their docs.

import type { ProfileRow } from '../shared/ipc'

export type { ProfileRow }

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

export function parseProfileList(raw: unknown): ProfileRow[] {
  const list = (raw as { profiles?: unknown } | undefined)?.profiles
  if (!Array.isArray(list)) return []
  return list
    .map((entry): ProfileRow | undefined => {
      const row = (entry ?? {}) as Record<string, unknown>
      const name = str(row.name)
      if (name === undefined) return undefined
      return {
        name,
        path: str(row.path) ?? '',
        isDefault: row.is_default === true,
        model: str(row.model),
        provider: str(row.provider),
        description: str(row.description),
        skillCount: typeof row.skill_count === 'number' ? row.skill_count : undefined
      }
    })
    .filter((row): row is ProfileRow => row !== undefined)
}

/** Their `/api/profiles/active` answers with two different things and the
 * difference is load-bearing:
 * - `current` — the profile THIS gateway process runs as, i.e. where the
 *   sessions in front of the user actually live;
 * - `active` — the sticky default a future CLI run would pick up.
 *
 * MEASURED: both are `"default"` on our dev profile, which is exactly the case
 * where confusing them would go unnoticed. */
export function parseActiveProfile(raw: unknown): { current: string; active: string } {
  const row = (raw ?? {}) as Record<string, unknown>
  return {
    current: str(row.current) ?? 'default',
    active: str(row.active) ?? 'default'
  }
}

/** A profile name this app is willing to put in a URL path.
 *
 * Their DELETE route takes the name as a path segment, so anything else would
 * be a way to aim a delete somewhere it was not meant to go. Their own
 * `normalize_profile_name` is more permissive; this is deliberately narrower —
 * nothing here needs a name outside it. */
export function isValidProfileName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
}

/** Why a delete must not proceed, or `undefined` when it may.
 *
 * Two refusals, both decided here rather than left to their API: the profile
 * the gateway is RUNNING as (deleting the home under a live process is not a
 * state anything recovers from cleanly), and `default` (it is not a profile
 * directory at all — it is the hermes root itself). */
export function refuseProfileDeletion(name: string, current: string): string | undefined {
  if (name === current) {
    return 'Это профиль, под которым сейчас работает ядро — сначала переключитесь на другой.'
  }
  if (name === 'default') {
    return 'Профиль «default» — это сам домашний каталог hermes, удалять его приложение не даёт.'
  }
  return undefined
}

export function describeProfileDeletion(name: string): string {
  return (
    `Удалить профиль «${name}»? Вместе с ним исчезнут его настройки, ключи, скилы и вся ` +
    'история его сессий — это отдельный каталог на диске, и восстановить его будет нечем.'
  )
}
