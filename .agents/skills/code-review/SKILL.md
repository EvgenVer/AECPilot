---
name: code-review
description: Run a full findings-first review of a concrete diff/PR for correctness, security, regressions, and scope. Use when the user explicitly asks to review a diff/PR, or when a completed change affects shared/public contracts, dependencies, security/auth/privacy/payments/data, migrations/external I/O, or more than three production files. Never use for reviewing a project/codebase generally, suggesting improvements, planning consistency, trivial edits, or routine low-risk bugfixes; those use Discussion or the lightweight check in AGENTS.md.
---

# Skill: code-review

Checklist and formats live in `docs/CODE_REVIEW.md`. In Reviewer Mode: findings-first,
risk-ranked, **no edits unless asked**.

Use a fresh-context reviewer only for large/risky orchestration, another large/risky
change, or an explicit independent-review request. Otherwise review in the current
context.

## Procedure
1. In one context batch, load the change, checklist, relevant SPEC/PLAN/TASKS, and only
   source needed to understand the diff. Do not reread unchanged artifacts.
2. Walk the checklist in `docs/CODE_REVIEW.md` (spec alignment, correctness, security,
   regressions, dependencies, tests/evals, scope hygiene, docs).
3. Report findings: `severity — file:line — issue — suggested fix`, ordered by severity.
4. For a large/risky change, add the risk summary from
   `assets/risk-summary.template.md`.

Do not edit while in Reviewer Mode unless the user separately asks for fixes.
After loading this skill, use at most three further command/tool rounds unless missing
evidence blocks a correct finding.
