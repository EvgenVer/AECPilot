---
description: Orchestrated autonomous execution of the approved TASKS.md via executor/reviewer subagents
argument-hint: [optional scope — phase or task filter]
---

Load and follow `.agents/skills/orchestration/SKILL.md`.

Run the orchestrated execution of the approved `TASKS.md`:
- **Preflight first**: plan approved; tasks atomic with `files:`/`verify:`/`dep:`/`parallel:`;
  subagents and permissions available. Then the interactive model-assignment step
  (orchestrator = session model; executor/reviewer = defaults from `.claude/agents/`,
  confirm or adjust). Any failed check → report it and offer the standard workflow.
- **Coordinator only**: do not edit production code yourself. Dispatch `executor` per
  task, review each result with `reviewer` in a fresh context (≤2 fix iterations, then
  escalate or park in Blocked), run each task's `verify:`, commit per logical block,
  update `TASKS.md`.
- **Gates stay in force**: high-risk actions → Vibe Diff + STOP; unresolved decisions →
  Blocked, continue independent tasks.
- Finish with the evidence-based report (per-task outcomes, commits, Blocked items + why).

Scope, if provided: $ARGUMENTS
