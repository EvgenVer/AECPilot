---
name: bug-forensics
description: Evidence-first debugging — reproduce a bug before fixing, isolate the root cause, and leave a regression test. Use when diagnosing a defect, a crash, a failing test, or behavior that diverges from expected. Do NOT use for new features, planned refactors, or style changes.
---

# Skill: bug-forensics  (Forensic Mode)

Fix causes, not symptoms. No fix lands before the bug is reproduced.

## Procedure
1. **Reproduce** — get a deterministic repro (command, input, or failing test). If you
   can't reproduce, gather evidence (logs, stack traces) until you can — do not guess-fix.
2. **Failing test** — capture the bug as an automated failing test where possible.
3. **Isolate** — narrow to the root cause (bisect, logging, minimal repro). Separate root
   cause from symptom.
4. **Fix the root cause only** — smallest change; do not mix in refactors or unrelated fixes.
5. **Regression test** — keep the now-passing test so the bug cannot silently return.
6. **Verify** — the repro is gone; nearby behavior is intact.
7. **Distill** — if the root cause is a reusable lesson (environment quirk, recurring
   pattern), record it in `MEMORY.md` using the existing entry format
   (fact · source · date · confidence). Skip one-off trivia — keep MEMORY high-signal.

## Use when (positive triggers)
- "This throws / crashes / returns the wrong value …"
- "Works in staging but not in prod."
- "A test started failing after the last change."

## Do NOT use when (negative triggers)
- Building a new feature (use `planning` / Builder).
- A planned refactor with green tests (no defect).
- A cosmetic / style change with no behavior bug.

Risk classification of repro steps (e.g. tests touching a DB): `docs/SECURITY.md`.
