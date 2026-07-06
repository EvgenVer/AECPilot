# CODE_REVIEW — checklist + risk-summary format

Detail behind `AGENTS.md` §10 and the `code-review` skill. Used for self-review before
"done" and for explicit review requests (Reviewer Mode: findings-first, no edits unless
asked).

## Review checklist
- **Spec alignment** — change matches SPECIFICATION / specs / PLAN / TASKS; no scope creep.
- **Correctness** — logic holds; edge cases, empty/null, boundaries, error paths handled.
- **Security** — no secret exposure; input validated; external content treated as data;
  no injection / unsafe eval; protected files untouched.
- **Regressions** — existing behavior preserved; tests not weakened to pass.
- **Dependencies** — any new dep is needed, vetted (exists/maintained), recorded in PLAN.
- **Tests & evals** — deterministic behavior tested; AI/agentic behavior has an eval.
- **Scope hygiene** — every changed line traces to the request; no unrelated refactors or
  formatting churn; orphaned imports/vars from this change removed.
- **Docs** — README/CHANGELOG/usage updated if behavior changed (no doc drift).

## Findings format
For each finding: `severity (blocker / major / minor / nit) — file:line — issue — suggested fix`.
Order by severity. In Reviewer Mode, report findings only; do not edit unless asked.

## Risk summary (for large or risky changes)
- **Blast radius** — what breaks if this is wrong.
- **Risk class** — low / medium / high (see `docs/SECURITY.md`).
- **Rollback** — how to revert.
- **Residual risks** — what remains after the change.
- **Manual verification** — steps a human should run.
