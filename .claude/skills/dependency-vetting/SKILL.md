---
name: dependency-vetting
description: Vet a dependency before adding it — verify the package actually exists in the registry (anti-slopsquatting), is necessary, maintained, and the right type. Use before adding or upgrading any package. Do NOT use for already-vendored code or for standard-library/built-in solutions.
---

# Skill: dependency-vetting

Hallucinated / typosquatted packages are a real supply-chain risk. Never add a package you
have not confirmed exists.

## Procedure
1. **Exists?** — confirm the exact name exists in the real registry (npm / PyPI / etc.).
   Do not trust a remembered name; verify it.
2. **Necessary?** — can the standard library or an existing dependency do it instead?
3. **Healthy?** — maintenance, recent releases, adoption, open critical issues.
4. **Type & cost** — runtime / dev / test / build; license; size; transitive risk.
5. **Record** — add to `PLAN.md` "Selected dependencies" with the reason. Never install
   globally unless the approved setup requires it.

## Use when (positive triggers)
- "Let's add <package> for this."
- A plan introduces a new runtime / build dependency.
- Upgrading a dependency across a major version.

## Do NOT use when (negative triggers)
- The capability is in the standard library / already a dependency.
- Read-only inspection with no install.
- Code is already vendored and unchanged.

Threat-model context: `docs/SECURITY.md` (dependency trust).
