---
name: orchestration
description: Execute explicitly requested parallel work when independent ready tasks benefit; otherwise return to sequential execution.
---

# Orchestrate independent work

The coordinator owns scope, scheduling, task state, permissions, integration, and
reporting. Executors own disjoint files and their relevant checks. Do not self-trigger.

## Decide whether it helps

Read the execution instruction, current phase/tasks, dependencies, and stable contracts.
Use the canonical TASKS rows and per-task detail blocks; do not require legacy
files/verify/dep/parallel inline fields on every ordinary task.

Parallel execution requires:
- multiple simultaneously ready tasks that benefit from independent sessions;
- explicit disjoint ownership and stable shared contracts;
- safe actions within existing permissions and usable independent verification;
- actual concurrent executor capability.

A task/file count or estimated duration alone does not establish benefit. Routine
single-step work should remain sequential. If the conditions fail, dispatch nobody
and report `ORCHESTRATION_NOT_BENEFICIAL` with the reason. Return to the normal
workflow and continue sequentially if execution is authorized, unless the user
requested parallel-only work. Do not claim serial dispatch was parallel execution.

Report effective configured role models once. Preserve user choices; ask only when
a requested model is unavailable or a material fallback/change needs a decision.

## Execute a wave

1. Select a ready disjoint set within the active phase, bounded by available capacity
   and at most three executors. If only one useful task is ready, return to sequential
   work instead of manufacturing a wave.
2. Give each executor its task, exact owned paths, relevant behavior contract, required
   checks, and boundaries. Tell it that others are working in the same repository:
   preserve their edits and coordinate rather than reverting them.
3. Forbid unrelated edits, planning-doc/log updates, commits, dependency installs, and
   external/destructive operations. The coordinator retains task-state ownership.
4. Dispatch the whole wave before waiting. Collect changed paths, actual checks/results,
   and blockers; reject ownership overlap or unrelated changes.
5. Accept unchanged passing targeted evidence; run the relevant integration check for
   the combined state. Review proportionally without a reviewer per successful task.
6. Update task results and Current together, then return to the shared task loop.
   Do not renumber tasks while their executors are active.

During a wave, the coordinator delegates production edits to the owning executor.
It can update shared task state and integrate evidence. Sequential fallback is normal
workflow execution outside the wave, not disguised orchestration.

## Failures and result

A failed check calls for targeted diagnosis and a justified correction, not an
unlimited executor/reviewer loop or a one-correction quota. Stop unproductive retries.
A missing permission/decision blocks affected work; continue an independent wave only
when it cannot be affected. Do not expand scope to make a blocked task executable.

For a substantial/risky integrated diff or an explicit independent-review request,
use a fresh reviewer when authorized and available. Otherwise review in context using
code-review's checklist when its trigger applies.

Report what ran concurrently, verification/integration results, changed task state,
and any remaining blocker. Use observed timing only when available; promise no token
savings. Parallelism alone never creates AGENT_RUNS. Resume normal execution through
[the shared workflow](../../../.agents/docs/AGENT_WORKFLOWS.md).
