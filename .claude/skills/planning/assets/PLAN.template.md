# PLAN — <project name>
<!-- Implementation route, not progress. Replace placeholders before use. -->

## Phases

| Phase | Outcome | After | Completion check |
|---|---|---|---|
| 1 | <usable outcome> | none | <observable evidence that establishes the outcome> |
| 2 | <next usable outcome> | 1 | <observable evidence> |

<!-- Use whole-number phase IDs. After lists mandatory preceding phases.
     A later phase with After: none explicitly declares independence.
     Keep future phases coarse; statuses and task evidence belong to TASKS. -->

## Technical decisions

- Architecture: <components and their boundaries; rationale>.
- Stack: <languages, runtime, package manager; rationale>.
- Dependencies: <selected package and purpose, or none>.
<!-- Add only actual decisions, including relevant data/API boundaries and tradeoffs.
     Add a ### Integrations subsection only when an integration is actually adopted:
     purpose, operation boundaries, configuration references; no credential values. -->

## Verification

- <Relevant checks and how they establish the phase outcomes; commands when known>.
<!-- Reuse sufficient task evidence. Add a phase-check task only for a distinct
     uncovered integration/end-to-end check. Results belong to TASKS. -->
