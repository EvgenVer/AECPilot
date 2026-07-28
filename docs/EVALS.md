# EVALS — evaluating AI / agentic behavior

Detail behind `AGENTS.md` §9. Tests check deterministic behavior; **evals** check
non-deterministic behavior (trajectory, tool choice, output quality). Without both, it is
still vibe coding.

## When an eval is required
Any change to prompts, agent instructions, tool routing, retrieval, or model selection.
**Shortening or rewording a prompt is not automatically behavior-neutral** — treat it as a
change requiring an eval unless proven otherwise. Do not close such a change on unit tests
alone.

### Editing a product prompt / agent-instruction file — mandatory fork
Any edit to a prompt or agent-instruction file that ships in a product (system prompts,
agent definitions, prompt templates) forces an explicit choice — never a silent save:
- **(A) Run an eval** — scenarios + rubric + baseline; ship only if it passes.
- **(B) Record a waiver** — a written, deliberate "skipping the eval because <reason>, on
  <whose> responsibility." The skip is then visible and accountable, not accidental.

This fork applies to **product** prompt/agent-instruction files only. It does **not** apply
to this toolkit's own governance files (`AGENTS.md`, `CLAUDE.md`, skills, `docs/`), which
change through the normal planning / approval / review process.

## Designing an eval
1. **Scenarios** — representative inputs, including edge cases and adversarial ones
   (e.g. injected instructions in external content).
2. **Rubric** — explicit pass/fail criteria per scenario; what "good" looks like.
3. **Baseline** — current behavior, so you can detect regressions.
4. **Tolerance** — acceptable variance for non-deterministic output.
5. **Failure examples** — known-bad outputs the eval must catch.

Template: the `ai-eval-design` skill's `assets/eval-case.template.md`.

## Reliability (beyond pass@1)
For action-allowed / agentic features, require *sustained* success, not a single pass.
- **pass^k** — passes k independent runs in a row (catches flaky/lucky passes).
- Report the pass rate over N runs, not one transcript.

## EDD — eval-driven development
For a new skill or agentic capability: write the eval first, watch it fail, then build
until it passes. "A skill without a test is a hope, not a capability."

## Toolkit regression harness
This toolkit's own scenarios live in `evals/cases.json`. Run `python -m evals
--provider <codex|claude> --suite all --list` to inspect the bound, then add `--yes` for
a real provider run. It materializes isolated legacy/current/candidate repositories,
runs hidden checks, and writes JSON plus Markdown reports under `.artifacts/evals/`.
Infrastructure failures are reported separately and exit with code 2; they do not count
as behavioral passes or failures. A selected write-required case runs first as a reused
write-canary, so a read-only provider environment aborts before the remaining calls.
Native Windows provider runs default to the `unelevated` sandbox backend so the parent
grader can read newly-created artifacts, and do not inherit parent Codex Desktop
session-policy variables. Temporary fixture checkouts live under the selected artifacts
directory rather than the system temporary directory, keeping them accessible to the
native sandbox with inherited project ACLs.
Full comparison gates use the same workflow cases for legacy/current/candidate, and
compare candidate orchestration with the same candidate fixture executed sequentially.
The full sequential implementation also runs under Legacy instructions. Reports include
cached and uncached token components plus trajectory metrics: raw commands, command
rounds, model turns, skill/review/doc reads, git commands, direct dispatch events, and
collaboration waits. A command round is one sequential batch; commands started together
before the first completion count as one round.
Generated Python caches are excluded from fixtures and snapshots.

The Legacy non-inferiority gate requires all candidate runs to pass, aggregate median
wall time and total tokens within 10%, uncached-input-plus-output at or below Legacy, no
more than 48 raw median commands, and no more than 25 median command rounds across the
six shared workflow cases. When the provider reports monetary cost, Candidate must not
exceed Legacy. Per-case command-round, model-turn, raw-command, and skill budgets also
catch ceremony regressions before aggregate ratios hide them.

If only Candidate changed, `--baseline-report <report.json>` reuses compatible
Legacy/Current rows while `--variant candidate` reruns the changed implementation.
Repeat the option to fill rows from more than one report. The runner rejects mismatched
provider/model settings, run count, seed, or Current ref, recomputes trajectory metrics
from stored events, includes a selected case's declared performance control, and lets
fresh rows replace matching reused rows.
Use `--repetition N` with a baseline report to replace only an infrastructure-failed
repetition without rerunning valid rows.

## Read → Draft → Act ladder
Grant capability in stages, gated by evals at each rung:
1. **Read** — the agent can only observe.
2. **Draft** — it proposes an action but does not execute.
3. **Act** — it executes, once Draft-level evals are consistently green.

## Failure modes to probe
- **Trigger** — the right skill/tool fires (and the wrong one does not).
- **Execution** — the procedure runs correctly.
- **Token budget** — context stays within useful limits.
- **Regression** — previously-fixed behavior stays fixed.

## LLM-as-judge
When output is open-ended, score with a rubric-driven judge model. Keep the rubric
explicit and versioned; spot-check the judge against human judgment.

## Intent & Outcome (before "done")
- Does it solve the *real* task, not just pass the literal check?
- Are the non-goals still intact?
- Any hidden UX, security, or cost risk introduced?
