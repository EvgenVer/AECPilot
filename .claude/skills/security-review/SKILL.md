---
name: security-review
description: Run a security pass before risky changes ship — secret-scan, dependency-vulnerability check, light SAST. Use for changes touching auth, payments, data handling, secrets, migrations, or external I/O. Do NOT use for isolated cosmetic/docs changes.
---

# Skill: security-review

Principles and threat model live in `docs/SECURITY.md`. This is the operational pass.

## Procedure
1. **Secret-scan** — no secrets / PII added to code, tests, specs, logs, or history.
2. **Dependency vulnerabilities** — check new / updated deps against known advisories.
3. **Light SAST** — input validation, injection, unsafe eval, authz checks; external
   content treated as data, not instructions.
4. **Protected areas** — auth / payments / migrations / CI / IaC / MCP config reviewed
   with extra care.
5. Report findings via the `code-review` format; block on unresolved high-severity issues.

## Use when (positive triggers)
- Change touches auth, payments, secrets, or user-data handling.
- Adding external I/O, a new dependency, or a migration.
- Before deploying a risky change.

## Do NOT use when (negative triggers)
- Isolated cosmetic or docs-only change.
- Read-only local inspection.
- A trivial one-line fix with no security surface.
