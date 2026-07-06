---
description: Run the structured /grill interview to elicit or augment DESCRIPTION/SPEC
argument-hint: [topic or task to brainstorm]
---

Load and follow `.agents/skills/grill/SKILL.md`.

Run the structured interview / brainstorm:
- Ask option-driven questions in **small batches** using the **AskUserQuestion** tool (2–4
  options each; the user may choose "Other" and type their own).
- Cover the dimensions in `.agents/skills/grill/assets/interview-checklist.md`; adapt
  follow-ups; challenge assumptions and surface non-goals and edge cases.
- **Adaptive output:** if there is no `DESCRIPTION.md`, write it from the answers; if it
  exists, augment the relevant doc; for an arbitrary topic, just produce a brainstorm summary.
- Do **not** write `PLAN`/`TASKS` and do **not** start code — hand off to the planning gate
  (which stops for approval) when the interview is done.

Topic, if provided: $ARGUMENTS
