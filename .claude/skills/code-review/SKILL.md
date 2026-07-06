---
name: code-review
description: Review a change (or self-review before done) for correctness, security, regressions, and scope, producing findings and — for large changes — a risk summary. Use before merging/finishing or when asked to review a diff/PR. Do NOT use to write features or fix bugs (use Builder / bug-forensics).
---

# Skill: code-review  (Reviewer Mode for external reviews)

Checklist and formats live in `docs/CODE_REVIEW.md`. In Reviewer Mode: findings-first,
risk-ranked, **no edits unless asked**.

**Self-review (Stage 6):** when subagents are available, run this review in a
**fresh-context subagent** (the `reviewer` agent, if the project ships one) — pass only
the diff, the checklist, and the relevant SPEC/TASKS; findings-only. Same-context
self-review tends to confirm its own assumptions. Otherwise review in the current context.

## Procedure
1. Load the change (diff) and the relevant SPEC / PLAN / TASKS.
2. Walk the checklist in `docs/CODE_REVIEW.md` (spec alignment, correctness, security,
   regressions, dependencies, tests/evals, scope hygiene, docs).
3. Report findings: `severity — file:line — issue — suggested fix`, ordered by severity.
4. For large / risky changes, add a risk summary (template: `assets/risk-summary.template.md`).

## Use when
- "Review this before I merge." / a PR or diff to review.
- Self-review at Stage 6 before marking work done.

## Do NOT use when
- Writing a new feature (Builder).
- Diagnosing / fixing a defect (`bug-forensics`).
