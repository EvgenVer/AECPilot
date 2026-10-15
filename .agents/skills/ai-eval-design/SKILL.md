---
name: ai-eval-design
description: Design or assess behavioral evals for changed prompts, agent instructions, routing, retrieval, or models. Authorize runs separately.
---

# Evaluate behavior

Use [EVALS](../../../.agents/docs/EVALS.md) for methodology and
[the case template](assets/eval-case.template.md) when useful.

1. Define representative requests, initial artifacts, expected outcomes, unacceptable
   actions, and tolerable variation. Include failure, interruption, and adversarial
   inputs where they affect the change.
2. Specify observable rubrics and a baseline before treating the candidate as better.
   For workflow changes cover continuation, dependencies/insertion, document consistency,
   phase preparation, memory, permissions, and handoff.
3. Prepare isolated fixtures and planned run bounds. Designing a scenario does not
   authorize model/provider calls, deployment, or external writes.
4. Before a live run, make the chosen cases, repetitions, tool/model, resource bounds,
   and side effects concrete; obtain any missing authorization. Respect existing
   permission for the same bounded run instead of asking again.
5. Record actual outcomes, failures, variance, elapsed time/usage when available, and
   tool coverage. Keep reports under .artifacts/evals and link them from task evidence.

For a product prompt/instruction edit, choose behavioral evaluation or record an
explicit waiver with its reason and responsible decision source. Do not silently
skip because the edit was short. Toolkit-governance changes use the authorized
review/evaluation process; report missing behavioral coverage rather than claiming
unit tests establish instruction quality.

Repeated action-allowed scenarios need reliability evidence across runs; report the
measured rate and sample size. A pass^k target is not a measured result. Do not weaken
a rubric after seeing failure. An offline fake/stub checks a runner, not agent behavior.

Do not create a run log unless explicitly requested. Return evidence, gaps, and any
justified correction to the shared workflow.
