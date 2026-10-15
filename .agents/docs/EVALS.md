# Evaluating agent behavior

Deterministic tests check code. Behavioral evaluations check the decisions, actions,
artifacts, and outcomes produced by an agent. Shorter instructions are not automatically
equivalent instructions; report behavioral coverage separately from offline test results.

## Design before claiming improvement

Define realistic requests and initial artifacts, an observable pass/fail rubric,
allowed variation, unacceptable actions, and a baseline. Keep scenario scope comparable
across variants. Include relevant edge cases, recovery, and external-input attacks.
Use the ai-eval-design skill's case template when useful.

For this toolkit, cover phase decomposition, continuation, dependency insertion,
document consistency, eligible memory, conditional files, permissions, cross-tool
handoff, and sequential fallback. Check resulting artifacts and executed behavior;
matching instruction wording alone does not establish success.

## Authorization and execution

Designing cases does not authorize paid provider calls or external writes. Before live
runs, make cases, repetitions, tool/model, time/resource bounds, and side effects clear.
Use existing authorization for the same bounded run; obtain only missing permission.
Run in isolated fixtures and keep protected/private content out of prompts and reports.

A product prompt/instruction edit requires a deliberate choice: evaluate, or record
a waiver with its reason and responsible decision source. Toolkit governance follows
its authorized review process, with unavailable behavioral coverage stated explicitly.
Never label a fake/stub provider or a manually imagined outcome as a model pass.

## Measure outcomes

Report actual sample sizes, pass/fail counts, variability, and observed time/usage.
Action-allowed scenarios need repeated reliability evidence; pass^k means sustained
success across k runs, not a conclusion from one good transcript.
Separate infrastructure failures from behavior failures. Preserve failed evidence;
do not loosen the rubric after seeing the result.

Review both literal acceptance and user intent: did the task finish, were exclusions
respected, were unnecessary stops avoided, and did new risks appear?
For open-ended judging, use a versioned rubric and check the judge against human review.

Reports belong in linked evaluation artifacts, not copied planning transcripts.
AGENT_RUNS is only for an explicitly requested separate log. Portable methodology lives
here; this toolkit's runner commands, benchmarks, and limitations are in `evals/README.md`
in the toolkit checkout, not in every installed project.
