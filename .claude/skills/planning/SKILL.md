---
name: planning
description: Prepare or reconcile project plans for new scope, technical decisions, phase decomposition, or inconsistent planning documents.
---

# Planning

Use the smallest preparation that makes the requested work executable. This skill
owns document format and synchronization, not a separate execution workflow.
AGENTS supplies ownership and authorization; return to its workflow when finished.

## Prepare what is needed

1. Recover context using AGENTS's task-entry rule. Reuse prior answers;
   missing DESCRIPTION does not imply a new interview. Use grill only for
   material unanswered questions or a requested interview.
2. For substantive project planning, use DESCRIPTION, SPECIFICATION, PLAN, and TASKS
   from [assets](assets/). For bounded work in agreed scope, use its existing task or
   request; do not bootstrap a document set or require a special exemption.
3. Record observable requirements in SPECIFICATION, technical decisions and phase
   outcomes in PLAN, and only the current phase's necessary atomic tasks in TASKS.
   Preserve useful decomposition already present. Future phases normally stay coarse.
4. Reconcile affected documents and run the read-only checker after the coherent
   structural change. Review requirement coverage and evidence yourself.
5. Ask for missing decisions/authorization only. If execution is already authorized,
   return to the task loop; phase decomposition is not another approval gate.

Do not install proposed dependencies while planning; record their rationale and vet
them immediately before an authorized install. Do not load all policies, history,
or another review skill merely to check document consistency.

## Canonical structure

Keep template heading order and field names; use the project's agreed prose language.
Replace placeholders before treating documents as executable. The
[filled example](examples/reading-list/README.md) demonstrates transitions.

| Document | Required sections |
|---|---|
| DESCRIPTION | Purpose; Audience; Context |
| SPECIFICATION | Requirements; Constraints and non-goals; Acceptance |
| PLAN | Phases; Technical decisions; Verification |
| TASKS | Current; Tasks; Proposals only when present |

PLAN phase columns: `Phase / Outcome / After / Completion check`.
Use sequential whole-number phase IDs. After lists mandatory preceding phases;
`none` on a later phase explicitly declares independence. PLAN has no task progress.

TASKS Current fields: Execution scope, Authorization source, Current phase,
Current task, Next checkpoint, Resume note. Current phase is a PLAN number or `none`,
never `complete`. At completed scope, keep the last phase number, set Current task
to `none`, and describe completion in Resume note. Use `none` for no active task/checkpoint;
use `unknown` for missing authorization evidence, never fabricate it. Current refers
to actual rows; it is not another status table. During authorized parallel work,
Current task may list the active task IDs; the coordinator keeps it consistent.

Under Tasks, use `### Phase 1`, etc., in PLAN order with columns
`ID / Task / Status / After / Verification`. Each task delivers one verifiable outcome,
including relevant implementation and checks. Do not split work into tool-call tasks.
Use todo, doing, blocked, done, cancelled. Sequential work has one doing task at most.

When useful, put one `Context:` line before a phase's table: relative file/section
links or code-directory paths, not copied requirements or a complete file inventory.
Tasks inherit it; use `- T4: Context: ...` below the table only for additional sources.
Omit empty/unhelpful pointers. Add them during decomposition; refresh affected links
when sources change or a stale link is encountered. Reading them needs no planning run.

Verification retains `Check: <method and expected outcome>; Result: <result>`.
Before execution, use `Result: pending`; afterwards use `Result: passed — <evidence>`,
`Result: failed — <evidence>`, or `Result: unverified — <missing evidence>`.
For example: `Check: python -m unittest discover -s tests; Result: passed — 4 tests`.
A command awaiting execution is not a pass.
Use `- T1: Reason: ...` below its table for blocked/cancelled work. Longer evidence,
operation permission, or exact parallel file ownership also belongs in task details.
Do not mark a required check passed when it was skipped or unavailable.

## Order, dependencies, and phase completion

- Prefer the user's task selection; otherwise use ready row order. After lists mandatory
  task prerequisites, or none. Numbers alone imply no dependency or execution permission.
  Expose missing dependencies rather than assuming independence from an empty field.
- Use project-wide T1, T2, etc. Insert T7.1 before T8 when appropriate; sort suffixes
  numerically. If the insertion is necessary preparation, update T8's After field.
- Repeated insertion can renumber a bounded unfinished queue and its live references.
  Keep done/cancelled IDs stable; no T7.1.1 and no routine renumbering log.
  Update current targets in an existing migration mapping; do not rewrite source history.
- Do not renumber while executors run. Completed work needing a new prerequisite
  receives follow-up/rework tasks, not a retrospective prerequisite.
- Cover each phase outcome before activation. Finish only with actual evidence for
  its completion criterion. Reuse sufficient task checks; create a separate check task
  only for an uncovered integration/end-to-end result.
- Cancellation requires a reason and cannot waive an agreed outcome. Resolve replacement
  work or a scope decision explicitly; cancelled tasks never satisfy After prerequisites.
- Keep terminal rows in their phases. Out-of-scope ideas go under Proposals and are
  never selected as approved work.
- Only a format migration may normalize all legacy IDs, including completed work.
  Follow the repository README update procedure; record `### ID changes` under Tasks
  with Previous reference / Current reference columns. Old IDs are lookup history,
  never live dependencies. Ordinary ID stability resumes afterwards.

## Update by event

| Event | Update |
|---|---|
| Task completed/blocked | TASKS result/blocker and Current; not PLAN by default |
| Next planned phase | Its decomposition in TASKS |
| Technical decision | PLAN and affected TASKS |
| Agreed requirements | SPECIFICATION and affected PLAN/TASKS; an affected feature contract |
| Eligible durable fact | MEMORY under the workflow's eligibility rules |
| Idea/audience changed | DESCRIPTION and only consequential requirement/route changes |

Reconcile affected documents before dependent execution. Do not update every file
after every task. Use existing task/request state for bounded maintenance.

## Conditional artifacts

- A feature spec is for a separately maintained public API/file-format compatibility
  contract, persisted-schema evolution, permission/state matrix, or independently
  versioned AI behavior contract. Record which trigger applies. Ordinary examples stay
  in SPECIFICATION; use [spec.feature.template.md](assets/spec.feature.template.md).
- MEMORY exists only for eligible durable facts; use the
  [workflow eligibility rules](../../../.agents/docs/AGENT_WORKFLOWS.md#memory).
- `### Integrations` belongs under PLAN Technical decisions only when a service/MCP
  is actually adopted; use [security boundaries](../../../.agents/docs/SECURITY.md).
- AGENT_RUNS requires an explicit user request for a separate log; ordinary operation
  results and applicable permission sources stay with their task.
- Do not create empty optional documents, NOTES, STATUS, PROGRESS, or ROADMAP.
  Existing history is not automatically discarded or archived.

## Read-only checks

From the project root:

```text
python .agents/skills/planning/scripts/check_docs.py check --root .
python .agents/skills/planning/scripts/check_docs.py status --root .
```

Run check after initial planning, phase decomposition/closure, changed requirements/route,
structural edits, ID/dependency changes, or migration. Do it once for the coherent
document state, not before each task or after each routine progress note. Correct
errors before dependent work or claiming completion; reuse an unchanged passing result.
Status is an on-demand derived view. The checker cannot verify permission, task
atomicity, evidence truth, or semantic phase coverage; those remain agent judgments.
