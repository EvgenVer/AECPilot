---
name: orchestration
description: Execute an approved TASKS.md autonomously by dispatching executor and reviewer subagents per task, with the main agent acting as coordinator only (no direct code edits). Use ONLY on an explicit user request — /orchestrate or an explicit phrase like "run TASKS with orchestration"; NEVER self-trigger. Do NOT use for planning (use planning), for a single small task or trivial change (dispatch overhead outweighs benefit), or when the plan/TASKS are not yet approved.
---

# Skill: orchestration  (Orchestrator Mode — opt-in)

Role-decomposed autonomous execution of an approved `TASKS.md`: the main agent
coordinates; **executor** subagents implement atomic tasks; a **reviewer** subagent
checks each result in a fresh context. Orchestration changes *who executes* Stages 4–6 —
never the rules: all gates (§6, §7) stay in force.

## Activation
Only on an explicit user request: `/orchestrate` (Claude Code) or an explicit phrase
("run TASKS with orchestration"). Never self-trigger; never treat a plain "implement
this" as orchestration. Without activation the standard workflow (`AGENTS.md` §5)
applies unchanged.

## Preflight (all checks before the first dispatch)
1. **Plan approved** — SPECIFICATION/PLAN/TASKS exist and passed the planning gate (§6).
   Not approved → STOP, route to `planning`.
2. **Tasks are orchestration-ready** — atomic, with `files:` / `verify:` / `dep:` /
   `parallel:` fields filled. Missing fields → fix `TASKS.md` first (with approval if
   scope changes); don't guess.
3. **Capabilities** — subagents available? per-subagent model selection? reviewer tool
   restriction? Report what this environment supports (matrix in
   `docs/AGENT_WORKFLOWS.md`). No subagents → report and offer the standard sequential
   workflow. **No silent fallback.**
4. **Permissions** — the harness must allow autonomous edits/tests, or every step will
   prompt the user. If not, say what to change or run attended.
5. **Model assignment (interactive)** — show the role table with starting values
   (orchestrator = session model; executor/reviewer = from their agent definitions); the
   user confirms or adjusts. Apply the choice for this run via the per-invocation model
   parameter; on "remember this" update the agent definition files. If the environment
   cannot set a per-subagent model, say so and run all roles on the session model.

## Orchestrator contract
The coordinator does **not** edit production code and does not review its own
integration. It only: picks tasks, briefs subagents, integrates results, runs
validation, commits, updates `TASKS.md`, reports. Keeping implementation detail out of
the coordinator's context is what preserves its judgment as arbiter.

## Loop (per task, in `dep:` order; parallel only where marked and `files:` are disjoint)
1. Pick the next Active task whose `dep:` is satisfied.
2. **Brief the executor** (self-contained — it starts cold): task text, `files:` scope,
   `verify:` command, the relevant SPEC excerpt, and "no unrelated refactors". One
   executor per task.
3. Receive the result: diff summary + `verify:` outcome + plainly-stated blockers.
4. **Review in a fresh context** — dispatch the reviewer (findings-only) with the diff,
   the `docs/CODE_REVIEW.md` checklist, and the relevant SPEC/TASKS excerpts.
5. Findings → back to the executor with the findings. Budget: **≤2 fix iterations**;
   then escalate — re-brief, split the task, or park it in Blocked. Never loop forever.
6. Run the task's `verify:`; green → commit the logical block (§5 Stage 4 cadence) and
   mark the task Done (`verified: <how>`).
7. Next task. **High-risk actions (§7) → Vibe Diff + STOP, even mid-run.** Missing
   decision / spec conflict → park in Blocked (with why) and continue independent tasks —
   no answer ≠ approval (§6). Everything Blocked → stop with a report.

## Resumability
All run state lives in `TASKS.md` (Active / Blocked / Done). An interrupted run resumes
by re-running preflight and continuing from the next Active task.

## Report (Stage 7)
Per-task outcomes with commits, Blocked items and why, review iterations used,
validation evidence, residual risks. Evidence-based (§10) — state failures plainly.

## Use when (positive triggers)
- The user explicitly runs `/orchestrate`, or explicitly asks for orchestrated /
  role-decomposed / autonomous execution of an approved `TASKS.md`.

## Do NOT use when (negative triggers)
- No explicit request — never self-trigger.
- SPEC/PLAN/TASKS not yet approved (go to `planning` and the gate).
- A single small task or trivial change — dispatch overhead outweighs the benefit.
- Subagents unavailable — standard sequential workflow instead.

Role agent defaults: `.claude/agents/` (Claude Code), `.codex/agents/` (Codex) —
`model` values are user-editable. Environment matrix + model-tier guidance:
`docs/AGENT_WORKFLOWS.md`.
