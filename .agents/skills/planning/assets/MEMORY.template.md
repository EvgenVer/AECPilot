# MEMORY — stable cross-session context
<!-- Only durable, low-frequency facts. Do NOT store: secrets, task progress, long logs,
     or duplication of the triad. If a fact becomes part of the current task → move to TASKS/NOTES. -->
<!-- Entry format: one bullet per fact, stamped —
     `<fact>  ·  source: <where>  ·  date: <YYYY-MM-DD>  ·  confidence: high/med/low`.
     Stale-check before relying on an entry; re-verify old or low-confidence facts. -->

## User preferences
<!-- Durable preferences, recurring corrections. -->

## Environment quirks
<!-- Environment / tooling specifics that should not be rediscovered each session. -->

## Durable project facts
<!-- Stable facts not derivable from code or git. -->

<!-- ───────── EXAMPLE — delete this whole block before use ─────────
## User preferences
- Wants diffs shown before any commit · source: kickoff call · date: 2026-06-24 · confidence: high

## Environment quirks
- Windows; Git turns LF→CRLF (warnings are cosmetic) · source: observed · date: 2026-06-24 · confidence: high

## Durable project facts
- Transcript speaker labels are always `S1:`/`S2:` · source: DESCRIPTION · date: 2026-06-24 · confidence: med
───────────────────────────────────────────────────────────────── -->
