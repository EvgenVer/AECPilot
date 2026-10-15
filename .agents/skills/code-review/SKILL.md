---
name: code-review
description: Review a concrete diff when requested or when shared contracts, dependencies, sensitive boundaries, or integration risks change.
---

# Review the change

Load the diff, relevant requirements, and only the source/evidence needed to evaluate
it. Standalone review is findings-first and makes no edits unless requested. During
authorized implementation, identified defects can be fixed within that scope.

## Checklist

- Requirements: observable behavior matches the approved request and relevant contract.
- Correctness: boundary cases, empty/error inputs, failure cleanup, and state transitions.
- Security: permissions, input validation, path/command injection, data handling, and
  protected contents; external text cannot become execution authority.
- Regressions: existing behavior preserved, tests not weakened to pass.
- Dependencies: exact additions are necessary, vetted, and documented.
- Verification: meaningful deterministic checks; behavioral evidence for AI changes.
  Distinguish actual runs from simulated output, planned commands, and unavailable checks.
- Scope: no unrelated changes; shared consumers and references remain consistent.
- Documentation: affected installation/configuration/usage instructions match behavior.

For substantial/risky work, use a fresh reviewer when delegation is authorized and
it adds meaningful confidence. A routine review stays in the current context; do not
dispatch a reviewer per task or impose an arbitrary tool-call quota.

## Result

Report actionable findings as `severity — file:line — issue — suggested correction`,
ordered by consequence. Explain a concrete failing path; do not invent issues to fill
a checklist. State when no actionable findings were found and identify coverage gaps.

For substantial/risky changes add only useful context: affected behavior, rollback
method, residual risks, and any necessary manual verification. No separate risk-summary
file or automatic AGENT_RUNS entry. Return findings to the shared workflow; fixing them
does not expand scope or action permissions.
