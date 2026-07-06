# Interview checklist — coverage for `grill`

Walk these dimensions; ask option-driven questions in small batches. Not every dimension
applies to every task — skip what's irrelevant, dig where answers are vague.

1. **Problem & intent** — what problem, why it matters, who is hurt without it.
2. **Target users / audience** — who uses it; their technical level.
3. **Goals / success criteria** — what success looks like, concretely.
4. **Non-goals / guardrails** — what is explicitly out of scope (privacy, "never do X").
5. **Constraints** — tech/platform, time, budget, compliance, offline vs online.
6. **Key scenarios** — the happy path(s), step by step.
7. **Edge cases & failure modes** — what breaks it; what must degrade gracefully.
8. **Acceptance criteria** — how we will know it works (testable).
9. **Risks / unknowns / open questions** — what is uncertain or assumed.
10. **(AI/LLM work)** — expected behavior, eval criteria, prompt-behavior boundaries; hand
    the eval design to `ai-eval-design`.

## Sample option-sets (to seed AskUserQuestion)
Always include an "Other" free-text choice.

- **Scope size:** "MVP — one core flow" · "Several flows" · "Full product"
- **Primary user:** "Just me" · "My team (technical)" · "End users (non-technical)"
- **Privacy posture:** "Fully offline" · "Cloud OK, no PII" · "Cloud + PII with consent"
- **Done means:** "A passing test suite" · "A working demo" · "Shipped to users"
- **Risk appetite:** "Conservative / proven only" · "Balanced" · "Move fast, iterate"

Keep each question concrete and answerable; one decision per question.
