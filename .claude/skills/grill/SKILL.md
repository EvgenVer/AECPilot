---
name: grill
description: Run a structured interview / brainstorm to elicit requirements and write or augment DESCRIPTION (and SPECIFICATION inputs), asking option-driven questions. Use at project bootstrap when DESCRIPTION is missing, or any time the user asks to brainstorm, interview, or "grill" an idea/task, or runs /grill. Adaptive output; never writes PLAN/TASKS and never authorizes code. Do NOT use when requirements are already clear and approved, for trivial changes, or for pure implementation.
---

# Skill: grill

A structured, option-driven interview that pressure-tests an idea and turns it into planning
inputs. It is the elicitation **front-end to the planning gate** (`AGENTS.md` §6): it
writes/augments `DESCRIPTION.md` (and gathers `SPECIFICATION` inputs). It does **not** write
`PLAN`/`TASKS` and never authorizes implementation.

## Interaction style
Ask in **small batches** with concrete **options to choose from**, not open walls of text.
- Claude Code: use the **AskUserQuestion** tool — 2–4 options per question; the user can
  also pick "Other" and type their own.
- Other tools (Codex, …): present numbered options inline; the user picks a number or writes
  their own answer.

Probe, don't interrogate: challenge assumptions, surface non-goals and edge cases, but stay
collaborative. Adapt each follow-up to the previous answer.

## Procedure
1. **Seed.** If there is no `DESCRIPTION.md` (or this is a fresh invocation), ask the user for
   a one-paragraph description of the idea/task. If augmenting, read the existing
   `DESCRIPTION`/`SPECIFICATION` first and target only the gaps.
2. **Interview.** Walk the coverage checklist (`assets/interview-checklist.md`), asking
   option-driven questions in small batches. Skip dimensions already answered; dig where
   answers are vague. Reflect a running summary back so the user can correct it.
3. **Output (adaptive) — only from real answers.** Write or augment **only from the user's
   actual answers**. If questions go unanswered or dismissed, or you're running
   non-interactively, **do not fill the document with your own assumptions — STOP and ask**
   (`AGENTS.md` §6, "No answer ≠ approval"). You may *show* recommended options to make
   answering easy, but never write them into the doc as if decided.
   - No `DESCRIPTION` → once answered, write `DESCRIPTION.md` from the answers (DESCRIPTION
     template shape).
   - `DESCRIPTION` exists / SPEC thin → augment the relevant doc with the answered inputs
     (goals, non-goals, acceptance criteria, edge cases).
   - Invoked on an arbitrary topic with no document intent → deliver a brainstorm summary; no
     artifact is forced.
   - Never write `PLAN.md` or `TASKS.md` here.
4. **Handoff.** Stop and pass control to the planning gate (`planning` skill) to formalize
   `SPECIFICATION`/`specs`/`PLAN`/`TASKS` — which still **stops for approval** (§2, §6). The
   interview itself does not authorize any code.

## Use when (positive triggers)
- Project/feature bootstrap: `DESCRIPTION.md` is missing and the task is non-trivial.
- The user asks to brainstorm, interview, or "grill" an idea, task, or decision (or runs
  `/grill`).
- An existing `DESCRIPTION`/`SPECIFICATION` is thin and needs fleshing out.

## Do NOT use when (negative triggers)
- Requirements are already clear — go to `planning` if SPEC/PLAN/TASKS aren't written yet,
  or to **Builder/implementation** if `TASKS` are approved. Either way, not `grill`.
- A trivial change, read-only inspection, or pure implementation of an approved task.
- You would be writing `PLAN`/`TASKS` or starting code — that is `planning` + the gate, not
  this skill.

Checklist: `assets/interview-checklist.md`.
