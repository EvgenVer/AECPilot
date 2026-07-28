---
name: bug-forensics
description: Evidence-first debugging — reproduce a bug before fixing, isolate the root cause, and leave a regression test. Use when diagnosing or fixing a defect, crash, failing test, or behavior that diverges from expected. Do NOT use for new features, planned refactors, style changes, or general review. A routine low-risk fix uses this skill plus the lightweight final check; do not automatically chain code-review.
---

# Skill: bug-forensics  (Forensic Mode)

Fix causes, not symptoms. No fix lands before the bug is reproduced.

## Procedure
Use at most five command/tool rounds after loading this skill. Combine independent
searches/reads, and combine post-fix targeted/full checks plus final diff where safe.

1. In one context batch, inspect the target implementation/tests and reproduce once. If
   it does not reproduce, gather evidence instead of guessing.
2. Add or identify a failing regression test where practical; isolate the root cause.
3. Apply the smallest root-cause fix without refactoring unrelated code.
4. Run the targeted regression check once after the fix. Run one full suite only when
   blast radius warrants it.
5. In one final batch, inspect diff/scope and validation evidence. Do not load
   `code-review` unless its independent large/risky trigger holds.
6. Record a reusable environment fact in MEMORY only when it is stable and likely to
   recur. Routine bugfixes do not create `AGENT_RUNS.md`.

Do not repeat a passing check without a subsequent relevant change. Do not load security
policy/docs unless the defect touches a security/data/auth/external-I/O boundary.

Risk classification of repro steps (e.g. tests touching a DB): `docs/SECURITY.md`.
