---
name: orchestration
description: Execute substantial approved TASKS.md work with bounded parallel executor waves and one integration review. Use ONLY after an explicit /orchestrate or equivalent request. Before dispatching, decline with ORCHESTRATION_NOT_BENEFICIAL when fewer than three meaningful tasks exist, fewer than two ready tasks contain substantial independent implementation/slow verification, the ready-set width is below two, file scopes overlap, shared contracts are unresolved, risk is high, or safe parallel subagents are unavailable. Do not use for planning, small functions/boilerplate, or ordinary sequential implementation.
---

# Orchestration

Use parallelism only where it can provide a measurable benefit. The coordinator owns
scope, scheduling, integration, validation, and reporting; executors own disjoint task
files. Do not turn every task into an executor/reviewer ceremony.

## Activation

Activate only on an explicit `/orchestrate` or an equally explicit request for
orchestrated execution. Never self-trigger.

## Preflight

Complete every check before the first dispatch:

1. Confirm that `SPECIFICATION.md`, `PLAN.md`, and `TASKS.md` are approved.
2. Parse each active task's `files:`, `verify:`, `dep:`, and `parallel:` fields. Do not
   infer missing scope.
3. Confirm that parallel subagents and safe concurrent writes are available.
4. Build the dependency-ready set.
5. Apply the eligibility gate below.
6. Report the effective role models once. Ask for approval only if a requested model is
   unavailable, a fallback or material model change is required, or the user explicitly
   asks to choose models. Otherwise use the configured/session defaults without another
   confirmation round.

## Eligibility gate

Dispatch no subagents unless all conditions hold:

- at least three meaningful active tasks remain;
- at least two tasks are ready at the same time;
- at least two ready tasks are executor-scale: each owns at least two non-test production
  files, has measured independent verification taking at least 60 seconds, or has other
  concrete evidence that it needs a substantial standalone Builder session. Estimates
  without repository evidence do not count; when uncertain, decline;
- several single-file functions / wrappers / prose edits do not qualify merely because
  they are split into separate tasks;
- at least two ready tasks have disjoint declared file scopes;
- no selected task changes an unresolved shared API, schema, type, migration, dependency,
  security boundary, or other shared contract;
- each selected task has a bounded verification command;
- the environment can run the selected executors concurrently.

If any condition fails, stop before dispatch and return:

```text
ORCHESTRATION_NOT_BENEFICIAL
reason: <specific failed condition>
recommended_mode: sequential
```

This is a successful routing decision, not an orchestration failure. Do not silently
fall back to sequential implementation inside this skill.

## Coordinator contract

The coordinator does not edit production code. It may update orchestration state after
integration. It:

- computes ready waves and prevents overlapping ownership;
- dispatches all executors in a wave before waiting;
- validates returned file scopes and rejects unrelated changes;
- runs integration checks after each wave;
- commits only when the user or repository explicitly requested it;
- reviews the integrated diff against the approved contract in its current context.

## Wave algorithm

Repeat until no active tasks remain:

1. Recompute tasks whose dependencies are complete.
2. Select the maximum safe disjoint set, capped at three. If two or more eligible tasks
   are ready, never dispatch a one-task wave.
3. Brief each executor with only its task, exact file ownership, the complete
   task-relevant contract, one verification command, and areas it must not touch.
   Require tests for the contract's stated edge cases. Explicitly forbid planning,
   `code-review`, run-log/TASKS updates, commits, and unrelated validation.
4. Dispatch every executor in the wave before waiting for any result.
5. Collect concise results: changed files, verification command and outcome, blockers.
6. Reject scope overlap or unrelated edits. Stop the affected task rather than merging
   ambiguous ownership.
7. Accept clear passing executor evidence without rerunning the same targeted commands.
   Run the smallest relevant integration check once for the resulting code state.
8. Mark verified tasks complete; leave failed tasks blocked with evidence. Recompute the
   next ready set.

Executors self-verify their atomic work and return only changed files, their one command,
and its outcome. Do not dispatch a reviewer per successful task.

## Review and correction budget

After all waves pass integration validation, the coordinator reviews the complete
integrated diff against the relevant requirements and `docs/CODE_REVIEW.md` in its
current context. Do not dispatch a fresh reviewer by default.

- No findings: finish.
- Localized finding: send only the affected task and finding to one executor, then rerun
  its check plus integration validation.
- Integration failure: dispatch one targeted reviewer/diagnostician with the failure
  evidence and relevant diffs.
- Dispatch an independent fresh reviewer only for large/risky orchestration or when the
  user explicitly requests independent review.
- Allow one correction iteration. If it still fails, stop and report the blocker. Do not
  create an open-ended executor/reviewer loop.

## Stop conditions

Stop on high-risk actions, unresolved requirements, overlapping file ownership,
unexpected dependency changes, repeated validation failure, or loss of parallel
execution capability. Continue an independent wave only when it cannot be affected by
the blocked work.

## Report

Report:

- eligibility decision and ready-set width;
- tasks and executor count per wave;
- wall-clock duration when the environment exposes it;
- validation commands and outcomes;
- review and correction count;
- blocked work and residual risks.

Keep resumable status in `TASKS.md` only when the project already uses that status
convention.
