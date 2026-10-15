# Reading-list planning example

This is a fictional project state, not an implemented application or a report of tests
executed in this repository. Its four documents demonstrate the canonical format.
Projects do not need to copy this example or maintain this walkthrough.

| Event | Expected update |
|---|---|
| Enter phase 2 | Read Current, task/prerequisites, the phase and global constraints, then its Context pointers. Start T3 unless the user selects another ready task. Phase 3 stays coarse |
| User selects T5 | T2 is verified, so use phase 2 context and the help requirement/check; T3 need not run first. Reuse unchanged context within the session |
| A pointer is absent or stale | Find the specific missing requirement/interface in its source; repair a stale pointer. No new document or approval is needed for reading; actual missing decisions block affected work |
| Finish T3 | Record the actual renderer check and result, set T3 to done, and start the first ready task, T4. PLAN stays unchanged |
| Discover escaping is required before T4 | Insert T3.1 in phase 2 before T4. Give it its own check and prerequisite T3; add T3.1 to T4's After field. Row insertion alone does not establish this dependency |
| T3 is blocked | Record `- T3: Reason: ...` below the table. T4 must wait; T5 can proceed because it requires only T2. Explain the switch |
| A check fails repeatedly | Reassess evidence and approach. Continue a justified new approach; block only when there is no justified safe next step or a real missing input. Do not stop just because this is failure three |
| Permission is missing | Ask for the missing permission and block affected work. Do not retry the operation or ask repeatedly without new input; continue independent authorized work |
| Close phase 2 | Compare T3–T5 evidence with PLAN's completion criterion. Reuse sufficient checks; do not add an identical "verify phase" task |
| A new integration needs a check not covered by tasks | Add a specific integration-check task in the affected phase before closing it, with the required task dependencies |
| Change an approved technical route | Update PLAN and affected TASKS together before dependent work. Update SPECIFICATION only if observable requirements changed |
| Activate phase 3 | Decompose its outcome into verifiable tasks, continuing global IDs from the existing queue, then continue within the execution boundary |
| Finish all authorized phases | Keep Current phase: 3, set Current task: none, and state completion in Resume note. Retain Check and use Result: passed — actual evidence in completed rows. Run the document checker on the final state |
| Convert a completed legacy task `old-A.4` | Give it a canonical ID, preserve its result/evidence, update live references, and record the old/new pair under TASKS `### ID changes`. Never infer a historical pass from a checked box alone |

Ordinary unfinished-task renumbering updates live references without a new mapping log.
When a migration mapping already exists, keep its current targets aligned with the same
tasks. Source history and completed task IDs remain stable during ordinary work.

Use the read-only checker from the repository root:

```text
python .agents/skills/planning/scripts/check_docs.py check --root .agents/skills/planning/examples/reading-list
python .agents/skills/planning/scripts/check_docs.py status --root .agents/skills/planning/examples/reading-list
```

It checks structure and derives task state; it cannot establish that illustrative or
recorded evidence is true. An agent must review actual results before claiming completion.
