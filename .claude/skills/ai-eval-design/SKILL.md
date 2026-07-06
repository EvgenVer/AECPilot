---
name: ai-eval-design
description: Design evals for an AI/agentic change — scenarios, rubric, baseline, tolerance, failure examples — when prompts, agent instructions, tool routing, retrieval, or model choice change. Do NOT use for purely deterministic code (use tests) or trivial copy edits.
---

# Skill: ai-eval-design

Methodology lives in `docs/EVALS.md`. Evals ≠ tests: they check non-deterministic
behavior (trajectory, tool choice, output quality).

## Procedure
1. Define scenarios (incl. edge & adversarial — e.g. injected instructions in external text).
2. Write a rubric: explicit pass/fail per scenario.
3. Capture a baseline of current behavior.
4. Set a tolerance for non-deterministic output.
5. Add failure examples the eval must catch.
6. Run with pass^k for action-allowed features; report the pass rate over N runs.

Template: `assets/eval-case.template.md`.

For a *product* prompt / agent-instruction edit the choice is mandatory: run an eval
(this skill) **or** record an explicit waiver — never a silent skip (`AGENTS.md` §9).

## Use when (positive triggers)
- Changing a prompt or agent / system instructions.
- Changing tool routing, retrieval, or model selection.
- Adding a new skill / agentic capability (write the eval first — EDD).

## Do NOT use when (negative triggers)
- Purely deterministic logic (use unit tests).
- A trivial copy / wording edit to **non-product prose** (docs, comments) — NOT a product
  prompt or agent-instruction edit, which always takes the mandatory eval-or-waiver fork
  even when described as "just wording" (`AGENTS.md` §9).
- Read-only analysis.
