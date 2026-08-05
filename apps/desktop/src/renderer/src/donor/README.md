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
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [1] gateway client → shared/gateway-bridge
 *   [3] removed the cron surface registration (SPEC §Non-Goals HX…)
 * (no other edits)
 */
```

`Edits:` lists **only** the four allowed kinds below, by number, one line each,
each naming what was touched. `(no other edits)` closes the list — the diff of
our changes must be reconstructible from this header alone when the file is
re-copied from a newer commit. A file copied unchanged says `Edits: none`.

## Exactly four allowed edits

Anything else is not an edit — it means the file does not belong in this zone.

1. **Gateway client** — their client import (`@/hermes`) → our IPC bridge
   (`shared/gateway-bridge`). The renderer never opens a WebSocket to the
   gateway itself (SPEC C9).
2. **i18n** — their i18n import → our catalog. Their keys, our strings.
3. **Non-goals** — removing a contribution that lands in SPEC § Non-Goals. The
   *registration* of a surface is removed, not its logic; if the logic has to be
   understood to cut it, the file is a rewrite, not a copy.
4. **Missing imports** — dropping imports we do not have: their cloud, their
   brand (`@nous-research/ui`), their telemetry.

Not allowed, and not negotiable per-file: renaming, reformatting, restyling,
"while I'm here" fixes, adapting to our lint preferences, or replacing their
state atoms with ours.

## Updating to a newer donor commit

Re-copy the file from the new `DONOR_SHA` and re-apply the edits listed in its
header. Never patch a vendored file toward a new upstream version.

## Our own surfaces do not live here

Explorer, sources, viewers, wiki, docgen, indexing status — those are ours and
live in `renderer/src/aec/**`. They are written in the same stack, but they are
not donor code and carry no provenance header.
