# AGENT_WORKFLOWS

Detailed expansion of `AGENTS.md` §4 (Execution Modes) and §5 (Standard Workflow), plus
the rules for parallel subagents. `AGENTS.md` stays lean; the detail lives here.

> Throughout this file, a bare `§N` refers to a section of **`AGENTS.md`**.

## Workflow diagram (Stage 0–7)

```mermaid
flowchart TD
    A[Stage 0: Intake — classify request, pick Execution Mode] --> B[Stage 1: Load context just-in-time]
    B --> C{Stage 2: Planning gate triggered?}
    C -- yes --> P[Run planning skill: SPEC / specs / PLAN / TASKS]
    P --> PA{Approved?}
    PA -- no --> PS[STOP — revise or wait; do not implement]
    PA -- yes --> D{Stage 3: Risk gate — classify action}
    C -- no --> D
    D -- high risk --> V[Vibe Diff]
    V --> VA{Explicit go?}
    VA -- no --> VS[STOP — do not act]
    VA -- yes --> E[Stage 4: Implement in small batches, <=3-5 files]
    D -- low / medium --> E
    E --> F[Stage 5: Validate — tests + evals + security + intent]
    F -- fail --> E
    F --> G{Stage 6: Full-review trigger?}
    G -- yes --> R[Run code-review]
    R -- findings --> E
    R -- clean --> H
    G -- no --> L[Lightweight diff / scope / evidence check]
    L --> H
    H[Stage 7: Track + evidence-based final report]
```

The two back-edges are bounded, not infinite: see the Stage 5 retry rule below.

## Execution Modes

Each mode is a behavioral contract: pick one at Stage 0 and stay in it until the task
changes. Modes constrain *what the agent is allowed to do*, not just its tone.

| Mode | Purpose | Allowed | Not allowed | Linked skill |
|------|---------|---------|-------------|--------------|
| **Architect** | Design & plan | Write SPEC/PLAN/TASKS, research, compare options | Production code | `planning` |
| **Builder** | Implement an approved plan | Edit/create code within scope, small batches, show diffs | Scope creep, unapproved deps | — |
| **Forensic** | Diagnose & fix a bug | Reproduce, add failing test, fix root cause, regression test | Speculative fixes, unrelated refactors | `bug-forensics` |
| **Reviewer** | Review a concrete diff/PR | Read, analyze, report findings (risk-ranked) | General project assessment; **editing code unless asked** | `code-review` |
| **Orchestrator** | Accelerate eligible approved TASKS via bounded parallel waves (opt-in) | Gate, schedule, brief/dispatch, integrate, validate, update TASKS | Direct production edits; serial dispatch disguised as orchestration | `orchestration` |
| **Author** | Write docs/prose | Create/update docs, README, comments | Behavior change | `docs-maintenance` |
| **Librarian** | Organize/retrieve knowledge | Search, summarize, index, cross-link | Behavior change | — |
| **Discussion** (default) | Refine, compare, advise | Questions, options, tradeoffs | Edits, installs, implementation |

Mode transitions: state the switch explicitly (e.g. "switching from Architect to Builder
now that the plan is approved"). Reviewer never silently turns into Builder.

## Stage detail
- **Stage 0 — Intake.** Read `AGENTS.md`. Classify the request (discussion / planning /
  implementation / validation / maintenance). Pick a mode.
- **Stage 1 — Context.** Load only what the request needs (`AGENTS.md` §3, Source of
  Truth). Don't preload everything; retrieve just-in-time.
- **Fast path.** Discussion/read-only work and trivial local edits skip workflow skills,
  review checklists, run logs, and VCS history unless independently triggered. Inspect
  once; for a trivial write, edit once and run one combined targeted check.
- **Stage 2 — Planning gate.** See `AGENTS.md` §6 (Planning Gate) and the `planning` skill.
- **Stage 3 — Risk gate.** See `AGENTS.md` §7 (Risk Gate) and `docs/SECURITY.md`.
- **Stage 4 — Implement.** Small batches (≤3–5 files); don't mix refactor and fix; don't
  weaken tests; placeholders for sensitive values.
- **Stage 5 — Validate.** `docs/EVALS.md` for AI behavior; tests for deterministic.
  Never repeat a passing check without a relevant code/environment change. A routine
  local fix gets one reproduction, one post-fix targeted test, and at most one full suite
  when its blast radius warrants it.
  Iterate until green, but **bounded**: after 2–3 failures of the *same* check, stop
  tweaking. Reflect — form a hypothesis for why the approach is wrong, re-read SPEC/PLAN;
  if the problem is at plan level, reopen the planning gate (§6) rather than patching
  symptoms. Repeated failed attempts pollute the context and degrade further tries.
- **Stage 6 — Review.** Every write gets a lightweight final diff / scope / evidence
  check in the current context. Load `code-review` only for an explicit review request or
  a large/risky change listed in `AGENTS.md` §10. Use a fresh-context reviewer only for
  large/risky orchestration or another large/risky/explicit independent review.
- **Stage 7 — Track & report.** Update TASKS / MEMORY / NOTES; conditional `AGENT_RUNS.md`;
  evidence-based final report.

## Subagents: context isolation and parallel work

Subagents serve two distinct purposes — isolation first, parallelism second:
1. **Context isolation** — for a triggered fresh-context review or bounded deep research
   whose intermediate noise shouldn't pollute the main context. Do not pay this overhead
   for routine sequential work.
2. **Parallelism** — independent tasks executed concurrently.

Prefer sequential work for small tasks. Parallelize (with subagents, when available) only
when tasks are independent, clearly scoped, and don't touch the same files or shared
contracts. If subagents aren't available, do the work sequentially — don't invent a
workaround — and keep the same validation standards.

### When to use
Good candidates (read / research / review — low conflict risk):
- Reading or searching separate areas of the codebase; large-codebase exploration.
- Researching a specific tool, API, or dependency.
- Reviewing an isolated file or module.
- Investigating an independent test or runtime failure.
- Running independent validation checks.

Parallel *implementation* is also possible, but only for work already approved under the
planning gate, where each task:
- is atomic and clearly described in `TASKS.md`;
- has no dependency on another in-progress task;
- does not edit the same files as another parallel task;
- does not change shared contracts (types / APIs / schemas) still under design;
- has a clear validation method and a result the main agent can integrate.

Good implementation candidates: independent modules with stable interfaces, separate UI
components, independent endpoints with approved contracts, isolated tests, docs for
separate areas, unrelated bug fixes.

### When NOT to use
- Unclear product or architecture decisions (need one shared source of truth).
- Dependency installation, package-manager, or migration steps.
- Destructive or high-risk operations.
- Security, privacy, auth, payment, or sensitive-data changes.
- Edits to the same files, or shared contracts still being designed.
- Tasks whose order is unclear.

### How to use
1. **Map dependencies first.** Read `PLAN.md` (phases, boundaries, shared contracts) and
   `TASKS.md` (atomic tasks, dependencies, expected files). If `TASKS.md` doesn't show
   dependencies / expected files / touched areas, fix that first or ask — don't guess.
2. **Brief each subagent self-contained** (it starts cold, with no shared memory). Give it:
   exact task scope; files/modules likely involved; files/areas to avoid; expected output;
   one validation command or manual check; and explicit "no unrelated refactors, no
   planning, review skill, run log, TASKS update, or commit".
3. **Isolate writes.** Two agents must never edit the same file. For parallel file
   mutation, give each its own area (or an isolated worktree).
4. **Return a distilled summary.** Each subagent returns ≈1–2k tokens of findings/results,
   not raw dumps.
5. **Main agent integrates.** Review every result, reject unrelated changes, resolve
   conflicts, ensure consistency with SPECIFICATION / PLAN / TASKS, run final integration
   validation, update `TASKS.md`, and report what was parallelized and how it was verified.

The main agent always owns scope, approval, integration, validation, planning-doc updates,
and the final answer. Subagents never bypass planning, approval, validation, or safety.

### Example
> Review three unrelated modules before a release.
> Dispatch three Reviewer subagents, one per module, each briefed with its file path, the
> review checklist (`docs/CODE_REVIEW.md`), and "findings only, no edits". Each returns a
> short risk-ranked findings list. The main agent merges and dedupes them into one review
> summary, then decides what to act on.

## Orchestrated execution (opt-in)

An optional execution strategy for Stages 4–6, activated **only** by an explicit user
request — `/orchestrate` in Claude Code, an explicit phrase elsewhere. Never
self-triggered. Procedure: the `orchestration` skill. Without activation, the standard
workflow above applies unchanged — same gates, same stops.

The main agent first applies a **benefit gate**. Orchestration runs only when at least
three meaningful tasks remain, the dependency-ready width is at least two, selected file
scopes are disjoint, contracts are stable, checks are bounded, and the environment can
actually dispatch concurrently. A failed gate returns
`ORCHESTRATION_NOT_BENEFICIAL` before any subagent starts; the caller can then choose the
normal sequential workflow.

At least two ready tasks must be executor-scale: each owns two or more non-test
production files, has a measured independent check of at least 60 seconds, or has other
repository evidence that it warrants a standalone Builder session. Unknown benefit
means decline; several single-file tasks are not a positive speed case.

Eligible work runs in waves of at most three executors. The coordinator dispatches every
executor in a wave before waiting and rejects scope overlap. Executors change only owned
files, cover their task-relevant contract, and run one assigned check; they do not plan,
review, log, update TASKS, or commit. The coordinator accepts passing targeted evidence,
runs one integration check, and reviews the integrated diff itself. A fresh reviewer is
reserved for large/risky or explicitly independent review; a targeted diagnostician is
added after validation failure. The correction budget is one iteration.

This structure targets wall-clock improvement and avoids promising token savings that
the environment cannot guarantee. Role definitions may still pin models, but preflight
only reports the effective choices. It asks the user again only for an unavailable model,
a fallback/material change, or an explicit model-selection request.

All gates remain in force: high-risk actions stop even mid-run; unresolved decisions and
overlapping ownership are blocked. No subagents or no safe concurrent writes means the
benefit gate declines orchestration instead of silently running a slower serial variant.
