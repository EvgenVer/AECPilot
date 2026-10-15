---
name: security-review
description: Check changed auth, payments, user-data, dependency, migration, or external-I/O security boundaries with available tools.
---

# Check the changed security surface

Use [SECURITY](../../../.agents/docs/SECURITY.md) for policy. Scope the review to the
actual changed boundaries and relevant callers, not every possible hardening measure.

- Inspect permission checks, untrusted inputs, path/command injection, failure cleanup,
  sensitive-data handling, and external effects relevant to this change.
- Run available approved secret/dependency/static-analysis tooling when relevant.
  Configure scans to exclude protected contents and suppress secret values; never
  print matching secret lines, credentials, or private user data.
- For changed dependencies, use current official advisories when needed. Do not
  install a scanner or add dependencies merely to complete this pass.
- Confirm test/reproduction commands do not silently access live services, secrets,
  or destructive fixtures.

Report actionable findings with location, consequence, and correction. Separate
passed, failed, unavailable, and not-applicable checks. An unavailable scanner is
not a passing scan; inspect what is possible and disclose the gap.
Unresolved serious vulnerabilities block the affected release/action.

Reuse relevant review evidence instead of automatically repeating a full code review.
Record results with the task; a separate log requires an explicit user request.
Return to the workflow for authorized corrections or the next ready task.
