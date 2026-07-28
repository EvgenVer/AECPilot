---
name: dependency-vetting
description: Vet an approved dependency immediately before adding or upgrading it — verify the package exists in the registry (anti-slopsquatting), is necessary, maintained, and the right type. Do NOT run during planning-only work, read-only inspection, for already-vendored code, or when the standard library/an existing dependency is sufficient.
---

# Skill: dependency-vetting

Hallucinated / typosquatted packages are a real supply-chain risk. Never add a package you
have not confirmed exists.

## Procedure
Confirm the dependency change is planned and approved before doing the work below.

1. **Exists?** — confirm the exact name exists in the real registry (npm / PyPI / etc.).
   Do not trust a remembered name; verify it.
2. **Necessary?** — can the standard library or an existing dependency do it instead?
3. **Healthy?** — maintenance, recent releases, adoption, open critical issues.
4. **Type & cost** — runtime / dev / test / build; license; size; transitive risk.
5. **Record** — add to `PLAN.md` "Selected dependencies" with the reason. Never install
   globally unless the approved setup requires it.

If planning introduces a dependency, record a pending vetting task in PLAN/TASKS and stop
with the rest of the plan. Load this skill later, immediately before the approved change.

Threat-model context: `docs/SECURITY.md` (dependency trust).
