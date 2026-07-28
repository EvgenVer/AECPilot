---
description: Execute eligible approved tasks in bounded parallel executor waves
argument-hint: [optional scope — phase or task filter]
---

Load and follow `.agents/skills/orchestration/SKILL.md`.

Run the orchestrated execution of the approved `TASKS.md`:
- **Preflight first**: apply the skill's benefit/eligibility gate before any dispatch.
  If it fails, return `ORCHESTRATION_NOT_BENEFICIAL` and stop.
- **Run real waves**: dispatch up to three dependency-ready executors with disjoint file
  ownership before waiting. Executors self-verify; the coordinator runs integration
  checks after each wave.
- **Review once**: use one fresh-context reviewer for the integrated diff. Use a targeted
  reviewer only after a validation failure, with at most one correction iteration.
- **Models**: report effective role models once. Ask only for a missing model, fallback,
  material change, or an explicit user choice.
- **Gates stay in force**: high-risk actions → Vibe Diff + STOP; unresolved decisions →
  Blocked, continue independent tasks.
- Finish with eligibility, wave width/count, validation, review count, and blockers.

Scope, if provided: $ARGUMENTS
