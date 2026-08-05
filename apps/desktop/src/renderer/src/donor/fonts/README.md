# donor/fonts

Binary assets copied from `apps/desktop/src/fonts/` at `DONOR_SHA`
(`3c27eb6234bf91b8ceee9e9071591b31e9b148cb`, `v2026.8.3`). They carry no
provenance header for the obvious reason — this file is the header for all of
them. `donor/styles.css` loads them by relative path, so they must keep these
names.

- `JetBrainsMono-{Regular,Bold,Italic}.woff2` — JetBrains Mono, **Apache-2.0**
  (JetBrains s.r.o.), bundled by the donor so the terminal's bold and italic
  share the regular face's metrics instead of squeezing against a system
  fallback. Not covered by the donor's own MIT — its license travels with the
  font and belongs in the licenses screen alongside it (task 6.x).

Their brand display face (`Collapse`, from `@nous-research/ui`) is deliberately
absent: see edit [4] in `donor/styles.css`.
