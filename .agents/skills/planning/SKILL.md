---
name: planning
description: Plan before non-trivial work — create or update SPECIFICATION, PLAN, TASKS and, only when needed, a feature behavior contract; then stop for approval. Use when a request changes requirements, architecture, business logic, dependencies, data handling, security/privacy/auth, or AI behavior, or expands scope; also for NOTES closeout. Do NOT use for trivial local fixes, read-only inspection, or already-approved execution.
---

# Skill: planning

The planning gate in `AGENTS.md` decides whether this skill runs. This file defines only
the smallest complete planning procedure.

## Procedure
1. If `DESCRIPTION.md` is missing, stop and use `grill`; do not plan or implement.
2. In one context batch, read existing DESCRIPTION / SPECIFICATION / relevant feature
   specs / PLAN / TASKS / MEMORY plus only the interfaces affected by the request.
3. Create or update:
   - `SPECIFICATION.md` — top-level requirements and non-goals.
   - `specs/<feature>.md` only when the feature has a non-trivial behavior contract,
     public API, schema, or material edge cases.
   - `PLAN.md` — technical decisions, dependencies, phases, and validation.
   - `TASKS.md` — atomic tasks with files, verify, dependencies, and parallel eligibility.
4. Check consistency across the documents in the current context.
5. **STOP for explicit approval.** Do not implement, install, stage, or commit.

## Efficiency contract
- After loading this skill, use at most five command/tool rounds: one combined context +
  required-template read and one combined final consistency check should normally suffice;
  file edits are separate. Do not split independent reads or checks across calls.
- Read templates only for missing documents, and read all required templates in one
  batch. Existing documents define their own structure.
- Do not scan VCS history, tool versions, the full repository, or unrelated docs unless a
  concrete planning decision depends on them.
- Do not load `code-review`; the consistency check above is the planning review.
- Do not create `AGENT_RUNS.md` for planning-only work.
- If a dependency is proposed, record that it requires vetting before approved
  implementation. Do not load `dependency-vetting` during the draft phase.

## Keeping docs in sync
- Requirement change → SPECIFICATION and any existing relevant feature spec.
- Technical decision → PLAN.
- Executable work / dependencies → TASKS.

For NOTES closeout, distribute stable facts to MEMORY, requirement changes to
SPECIFICATION, decisions to PLAN, and remaining work to TASKS before removing NOTES.

Templates live in `assets/`; copy only the ones required for the current output.
