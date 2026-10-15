# TASKS — Reading list
<!-- Fictional worked example. The authorization and completed evidence below are illustrative. -->

## Current

- Execution scope: implement phases 1–3 of the reading-list example
- Authorization source: illustrative user instruction, "Execute the three-phase plan"
- Current phase: 2
- Current task: none
- Next checkpoint: none
- Resume note: start T3; phase 1 checks are recorded below and phase 2 is decomposed

## Tasks

### Phase 1

| ID | Task | Status | After | Verification |
|---|---|---|---|---|
| T1 | Read title and URL records in input order | done | none | Check: compare parsed records for a two-row CSV; Result: passed — illustrative parser check returned both ordered records |
| T2 | Reject missing columns and malformed rows with useful errors | done | T1 | Check: valid, empty, and malformed inputs; Result: passed — illustrative validation cases returned the expected records/errors |

### Phase 2

Context: [requirements](SPECIFICATION.md#requirements); [technical decisions](PLAN.md#technical-decisions).

| ID | Task | Status | After | Verification |
|---|---|---|---|---|
| T3 | Render records as ordered Markdown links | todo | T2 | Check: compare full rendered output with the expected document; Result: pending |
| T4 | Add the export command with safe failure behavior | todo | T3 | Check: CLI success, invalid input exit status, and existing-output preservation; Result: pending |
| T5 | Explain command usage and errors in help | todo | T2 | Check: command help shows input/output arguments and failure behavior; Result: pending |

- T4: Context: [failure acceptance](SPECIFICATION.md#acceptance).
