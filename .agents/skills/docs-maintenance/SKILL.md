---
name: docs-maintenance
description: Keep README, CHANGELOG, and usage docs in sync when install/config/run behavior changes. Use after a change that affects how users install, configure, run, or verify the project. Do NOT use to author planning docs (use planning) or to change behavior.
---

# Skill: docs-maintenance  (Author Mode)

## Procedure
1. Identify what user-visible behavior changed (install / config / run / verify).
2. Update README / CHANGELOG / usage docs to match. Keep it short and practical:
   prerequisites, commands, inputs, outputs, common failures.
3. Do not duplicate planning content from the triad into user docs.

## Use when
- A change alters how users install / configure / run / verify the project.
- A release needs a CHANGELOG entry.

## Do NOT use when
- Writing SPEC / PLAN / TASKS (use `planning`).
- Changing code behavior (Builder / `bug-forensics`).
