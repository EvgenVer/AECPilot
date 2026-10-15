---
name: dependency-vetting
description: Vet the exact package/version immediately before an authorized dependency add or upgrade.
---

# Vet an intended dependency

Confirm the proposed change and concrete installation permission. Check the exact
name/version against the official registry; do not trust a remembered package name.

- Is the dependency necessary, or can existing code/the standard library do the job?
- Does the package/version exist, match the intended publisher/project, and remain
  suitably maintained? Investigate relevant critical issues or advisories.
- Is its runtime/dev/test/build type, license, size, and transitive risk appropriate?

Put the choice and rationale in PLAN's Technical decisions, without a duplicate
dependency document. Record vetting and later installation evidence with the task.
A separate audit log exists only when explicitly requested; link the same evidence.

Do not install globally unless specifically included in the authorized setup.
Planning may record pending vetting; it does not activate this skill or authorize
installation. Reuse unchanged relevant vetting within the same work instead of
repeating it because another skill was loaded. Return the decision to the workflow.

Policy: [SECURITY](../../../.agents/docs/SECURITY.md).
