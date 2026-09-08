# donor/ — vendored Hermes Desktop code

Files here are **not ours**. They are copied verbatim from Hermes Desktop
(`apps/desktop/src/**` in the hermes-agent repository) at the pinned snapshot
point, under MIT. The point of this zone is that the next donor update costs a
re-copy instead of a merge.

- Snapshot point: `DONOR_SHA` in [`runtime/donor-env.mjs`](../../../../../runtime/donor-env.mjs)
  (`node runtime/donor-env.mjs` verifies the on-disk tree against it).
- Read source: `runtime/.hermes-src/apps/desktop/src/**`.
- Policy: `PLAN.md` § «Слой донора — как именно берётся их код»; the hard rules
  are restated in `AGENTS.md` § Conventions.

## Layout

Their path structure is mirrored under this directory, so `src/app/chat/…`
upstream becomes `donor/app/chat/…` here. Their `@/…` import alias resolves to
this directory (see the renderer's vite/tsconfig aliases), which is what lets
their intra-tree imports survive the copy unedited.

## Provenance header — required on every file

```ts
/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/message-list.tsx
 * Commit:  e624e9fde561e1add9388384012b295fde669ade (v2026.8.18)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [1] gateway client → shared/gateway-bridge
 *   [3] removed the cron surface registration (SPEC §Non-Goals HX…)
 * (no other edits)
 */
```

`Edits:` lists **only** the five allowed kinds below, by number, one line each,
each naming what was touched. `(no other edits)` closes the list — the diff of
our changes must be reconstructible from this header alone when the file is
re-copied from a newer commit. A file copied unchanged says `Edits: none`.

## Exactly five allowed edits

Anything else is not an edit — it means the file does not belong in this zone.

1. **Backend client** — their way of reaching the backend → ours. The common
   case is their gateway client (`@/hermes`) → `shared/gateway-bridge`, because
   the renderer never opens a WebSocket itself (SPEC C9). The same edit covers a
   single call that must land somewhere else to satisfy a SPEC constraint —
   e.g. their provider-key field wrote the key into the core's env store in
   plaintext, and rule R2 puts provider keys in our safeStorage, so that one
   call goes to our bridge while the rest of their screen is untouched.
2. **i18n** — their i18n import → our catalog. Their keys, our strings.
3. **Registration tables** — changing WHICH contributions are registered:
   removing one that SPEC excludes (§ Non-Goals, or a constraint like R2 that
   forbids the mechanism it is built on), or registering one of ours (a
   locale, a surface) in the same table. The table, never the logic — if the
   logic has to be understood to make the change, the file is a rewrite, not a
   copy. Worked example: `i18n/{types,languages,catalog}.ts` carry a one-line
   `ru` entry each, because SPEC C7 requires a Russian interface and the locale
   list is exactly such a table.
4. **Missing imports** — dropping imports we do not have: their cloud, their
   brand (`@nous-research/ui`), their telemetry.
5. **Their product name in a string a person can see** → ours (SPEC C12, owner
   decision 2026-08-20). Only the name, only in user-visible text. Never in a
   storage key, a data attribute, a module path, an event name, or anything else
   the product depends on — renaming one of those is a rewrite wearing this
   edit's number. The most common kind by count: 47 of the 90 edits in this zone
   (measured 2026-09-08; kind 3 is second at 36). The count is prose, so re-measure
   it rather than trusting it — and exclude this file, whose examples look like
   headers:

   ```
   grep -rhoE '^ \*   \[[0-9]\]' --include='*.ts' --include='*.tsx' --include='*.css'      apps/desktop/src/renderer/src/donor | sort | uniq -c
   ```

Not allowed, and not negotiable per-file: renaming, reformatting, restyling,
"while I'm here" fixes, adapting to our lint preferences, or replacing their
state atoms with ours.

Our formatter and linter therefore skip `*.ts`/`*.tsx`/`*.css` in this
directory (`.prettierignore`, `eslint.config.mjs`) — their config is not ours,
and the only legal response to a finding inside their file is to leave it. What
still guards this code: the provenance header, the five edits above, the
renderer socket guard (`shared/renderer-socket-guard.test.ts`, SPEC C9), and
the tests that come with the file.

## Edit kind 1 in practice — the gateway seam

Their client (`@/hermes`) opens a WebSocket from the renderer and holds the
session token to do it; SPEC C9 says ours does neither. `shared/gateway-bridge`
presents the same surface — `request`, `on`/`onAny`/`onEvent`/`onState`,
`connect`/`close` — over our IPC bridge, so their ~200 typed wrappers work
unedited. `connect` and `close` are deliberately no-ops: main owns the
connection. Their `pluginSocket` (a raw WebSocket with the token in the query
string) has no counterpart and must not be vendored as-is.

## Updating to a newer donor commit

Re-copy the file from the new `DONOR_SHA` and re-apply the edits listed in its
header. Never patch a vendored file toward a new upstream version.

**The zone carries mixed commits, and that is correct.** Only files that
actually changed upstream get re-copied, so a file whose content is identical
across the two commits keeps the older stamp — the header records the copy it
came from, not the pin it is compatible with. After the 0.20.0 → 0.20.4 raise
(task 3.B0) 457 files still say `v2026.8.3` and 357 say `v2026.8.18`, and every
one of them matches the 0.20.4 tree byte for byte. The question "is this zone
current" is answered by `node runtime/donor-report.mjs <ref>` — zero changed
files means current — never by reading the stamps.

## Files we did NOT vendor

A file left behind has no header to record itself in, so it is recorded here.
This list is part of the port: on the next `DONOR_SHA` raise, check each line
still holds instead of re-copying the file by reflex.

| File                                               | Why not                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugins/hermes-bots/pet.tsx`                      | The pet is SPEC HX1. Its only importer (`avatar-picker.tsx`) drops the import as edit [3].                                                                                                                                     |
| `plugins/hermes-bots/pet.test.tsx`                 | Tests the file above.                                                                                                                                                                                                          |
| `plugins/hermes-bots/relay-deliver-budget.test.ts` | Reads source text by a path hardcoded to THEIR repo layout (`src/plugins/hermes-bots/relay.ts`, `../../hermes_cli/config_defaults.py`). It cannot resolve here, and repointing the paths is not one of the five allowed edits. |

Separately, one vendored test is temporarily excluded from the run rather than
dropped — see `DONOR_TEMPORARILY_OFF` in `apps/desktop/vitest.config.ts`, which
carries the measured reason.

## Our own surfaces do not live here

Explorer, sources, viewers, wiki, indexing status — those are ours and
live in `renderer/src/aec/**`. They are written in the same stack, but they are
not donor code and carry no provenance header.
