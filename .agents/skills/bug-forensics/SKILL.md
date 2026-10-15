---
name: bug-forensics
description: Diagnose and fix incorrect behavior, crashes, or failing checks using reproduction and root-cause evidence.
---

# Diagnose and fix

1. Inspect affected code/tests and reproduce the reported behavior with a safe,
   targeted check. If reproduction fails, gather evidence rather than guessing.
2. Identify the root cause and add or locate a meaningful regression check when
   practical. Keep the fix within the agreed behavior; clarify a real contract change.
3. Apply the smallest coherent fix and run the relevant check. Broaden verification
   only for integration concerns; do not repeat unchanged successful commands.
4. Inspect the resulting diff and evidence. Full review is conditional on its own
   trigger, not automatic for every bugfix.
5. Record the result with the task and return to the workflow's next ready work.
   Consider MEMORY only if the reproduced environment finding passes its eligibility
   rules; no automatic run log.

Repeated failure calls for a new evidence-based hypothesis, not a fixed tool-call
budget. Continue justified progress; block only a real missing input/permission or
when there is no justified safe next step. Avoid unchanged unproductive retries.

Classify reproduction/test side effects under
[SECURITY](../../../.agents/docs/SECURITY.md). Do not access live data or protected contents merely
to reproduce an error.
