# TASKS — <project name>
<!-- One execution ledger. Replace placeholders; do not invent authorization/evidence. -->

## Current

- Execution scope: <authorized outcome or phase boundary>
- Authorization source: <traceable user instruction, or unknown>
- Current phase: 1
- Current task: none
- Next checkpoint: none
- Resume note: <next useful action or decision>

<!-- Current phase is a PLAN number or none, never a completion label.
     When scope is complete: Current task: none; keep the last phase number and
     state completion in Resume note. Clear completed tasks from Current task. -->

## Tasks

### Phase 1

<!-- Optional: one Context: line of relative file/section links or code paths here.
     Tasks inherit it; use - T1: Context: ... below the table only for extra sources.
     Omit when unhelpful. Keep pointers, not copied requirements or exhaustive file lists. -->

| ID | Task | Status | After | Verification |
|---|---|---|---|---|
| T1 | <one verifiable outcome, including relevant checks> | todo | none | Check: <method and expected outcome>; Result: pending |

<!-- Keep done/cancelled rows in their phase. Allowed statuses:
     todo, doing, blocked, done, cancelled. After lists task IDs, or none.
     Row order is priority; IDs do not imply dependencies.
     After running a check, retain Check and use Result: passed — <evidence>,
     failed — <evidence>, or unverified — <missing evidence>. Never invent a pass.
     Example: Check: python -m unittest discover -s tests; Result: passed — 4 tests.
     Under a task table, add - T1: Reason: <blocker/cancellation> when applicable;
     longer evidence, permissions, and parallel ownership also belong in task details.
     Only the current/previously decomposed phases need tables.
     If a format migration changes legacy IDs, add ### ID changes with columns
     Previous reference and Current reference. It is lookup history, not dependencies.
     Add ## Proposals only for actual out-of-scope ideas; never execute them implicitly. -->
