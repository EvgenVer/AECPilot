# AGENT_RUNS — audit trail of non-trivial runs
<!-- Record a run ONLY for non-trivial / risky / multi-file / dependency / security /
     AI-eval / external-tool work. One terse block per run. Never store secrets. -->

## <date> — <short task name>
- Intent: <what & why>
- Risk class: <low / medium / high> · approvals: <plan? / vibe-diff?>
- Changed files: <list>
- Validation: <commands + result (pass / fail)>
- Skipped checks / waivers: <none | what was skipped, why, on whose authority>
- Outcome: <result, residual risks, follow-up>

<!-- ───────── EXAMPLE — delete this whole block before use ─────────
## 2026-06-24 — add rate-limit to /login
- Intent: stop credential-stuffing; cap to 5 attempts / 15 min per IP.
- Risk class: medium · approvals: plan ✔ · vibe-diff n/a (no high-risk op)
- Changed files: src/auth/login.ts, src/middleware/rateLimit.ts, tests/login.spec.ts
- Validation: `npm test -- login` → 12 pass / 0 fail; manual: 6th attempt returns 429
- Skipped checks / waivers: load test skipped — waiver, low traffic, on owner's authority
- Outcome: shipped; residual risk: shared-IP false positives; follow-up: per-account cap
───────────────────────────────────────────────────────────────── -->
