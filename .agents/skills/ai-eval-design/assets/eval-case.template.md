# Eval case — <capability / change name>
<!-- One eval case. Duplicate the Scenario block per scenario. -->

## Under test
<!-- What behavior/change this eval covers (prompt / agent / tool-routing / retrieval / model). -->

## Baseline
<!-- Current behavior before the change. -->

## Scenario: <name>
- Input: <input / context, incl. edge or adversarial cases>
- Expected: <rubric — what a passing output must satisfy>
- Tolerance: <acceptable variance for non-deterministic output>
- Known-bad: <example output that must fail>

## Reliability
- Runs: <N> · pass^k target: <k> · measured pass rate: <fill after running>
