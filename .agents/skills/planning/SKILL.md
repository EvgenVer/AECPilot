---
name: planning
description: Plan before non-trivial work — create or update SPECIFICATION, specs/, PLAN, and TASKS from templates, then stop for approval. Use when a request changes requirements, architecture, business logic, dependencies, data handling, security/privacy/auth, or AI behavior, or expands scope; also for the NOTES closeout. Do NOT use for trivial local fixes or read-only inspection.
---

# Skill: planning

The procedure for the planning gate. The **stop conditions** that decide *whether*
planning is required live in `AGENTS.md` §6 (always loaded). This skill is the *how*.

## When this runs
A planning-gate trigger fired (AGENTS.md §6): the request changes requirements /
architecture / business logic / dependencies / data handling / security / privacy / auth
/ AI behavior, or expands beyond approved scope.

**Bootstrap first.** If `DESCRIPTION.md` is missing and the task is non-trivial, agree
`DESCRIPTION.md` with the user before anything else — no planning or code until then. Use
the `grill` skill to run that elicitation interview.

### Use when (positive triggers)
- A request changes requirements, architecture, business logic, dependencies, data
  handling, or security / privacy / auth / AI behavior — or expands beyond approved scope.
- Starting a non-trivial project that has no `DESCRIPTION.md` yet (bootstrap first).
- Closing out a long task (the NOTES closeout below).

### Do NOT use when (negative triggers)
- A trivial local change — typo, formatting, a one-line fix — touching no requirement,
  behavior contract, data, dependency, or security.
- Read-only inspection or analysis.
- Work already planned and approved: you are executing the agreed `TASKS.md` unchanged
  and no new planning trigger has fired.

## Procedure
1. Load context just-in-time: existing DESCRIPTION / SPECIFICATION / specs / PLAN / TASKS / MEMORY.
2. Create or update, in this order (copy from `assets/` templates; keep each doc to its
   role — no duplication across docs):
   - `SPECIFICATION.md` — top-level requirements (what & why).
   - `specs/<feature>.md` — feature behavior contracts (BDD/Gherkin, API, schemas, edge
     cases). References SPECIFICATION, never copies it.
   - `PLAN.md` — architecture, stack, dependencies, phases, validation strategy.
   - `TASKS.md` — atomic checklist; each task has files + verify + dep + parallel.
3. Consistency review: SPECIFICATION ↔ specs ↔ PLAN ↔ TASKS agree; no contradictions;
   non-goals intact.
4. **STOP — wait for explicit approval.** Drafts and assumptions are not approval
   (AGENTS.md §2). Do not implement until approved.

## Keeping docs in sync
- Requirements change → update SPECIFICATION (+ specs).
- Technical decisions change → update PLAN.
- New subtasks discovered → update TASKS.
- Work diverged from plan → reconcile before continuing.

## NOTES closeout (before deleting NOTES.md)
When a long task ends, distribute working notes before removing `NOTES.md`:
- stable facts → `MEMORY.md`
- requirement changes → `SPECIFICATION.md`
- decisions → `PLAN.md`
- remaining / discovered tasks → `TASKS.md`

Then archive or delete `NOTES.md`.

## Templates (`assets/`)
SPECIFICATION · PLAN · TASKS · DESCRIPTION · MEMORY · NOTES · AGENT_RUNS · spec.feature
