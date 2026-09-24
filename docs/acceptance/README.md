# Acceptance reports

One folder per acceptance run: `docs/acceptance/<YYYY-MM-DD>/report.md` (task 3F.11,
SPEC AC15). Screenshots are copied next to it into `shots/` and are **not** committed
(`.gitignore`); the report links to them by name.

## How to produce a report
Run from `apps/desktop`:

1. `corepack pnpm e2e:acceptance`: builds the app and runs every `live-*`/`model-*`
   spec against the live core in one Playwright run. Model turns need
   `AEC_ACCEPTANCE_LIVE=1`.
2. `corepack pnpm e2e:acceptance:report [--date YYYY-MM-DD]`: writes the report.

Playwright clears `test-results/` on every run, so a report always shows the **last**
run only. Build it after one full run, not after several runs of single files.

## Inputs
| File | Written by | Holds |
|---|---|---|
| `test-results/acceptance/evidence.jsonl` | `e2e/lib/evidence.ts` | one entry per checklist position: verdict, note, shot, transcript |
| `test-results/acceptance/usage.jsonl` | `e2e/lib/turn.ts` | token usage for each model turn |
| `test-results/acceptance/results.json` | Playwright JSON reporter | run start and duration |
| `docs/manual-checklist.md` | the checklist | position labels and step text for the `[человек]` remainder |

## Reading the report
- ✅ passed, ❌ red, 🟡 for the owner: a model-quality verdict (skipped with the reason
  "к владельцу: …") or a skip for a stated reason. ⏸ `test.fixme` waiting on a decision.
  ⬜ has a test but was not run.
- **R21 / R22** (rows 48.3 and 45.2) have their own section: this is where they are
  proven, not just declared.
- The `[человек]` remainder is a checkbox list with its step text: the owner's manual
  pass.
