# Testing / How to Verify

## Automated

```sh
npm run check   # strict typecheck + full suite
```

- Baseline before branch: 139/139 pass. After all commits: **145/145 pass**, typecheck clean.
  `npm run check` was run after every commit on the branch.
- New tests (6):
  - `validateBundles`: `capabilities: null` reported not crashed; `capabilities` as array;
    non-string entries across all four term fields (per-field assertion); non-array `verbs`;
    non-numeric `minScore` (5 tests, faba7ba).
  - telemetry: pinned-profile route logs the true runner-up and negative margin (1 test,
    fc1b6de).
- Regression safety: the pre-existing 139 tests — including the reachability, paraphrase-
  fixture, and golden prod-failure suites that iterate the real `bundles.json` — pass
  unmodified, confirming routing behavior is unchanged.

## Manual spot checks

1. `/profile validate` with `"capabilities": null` in a scratch `.omp/bundles.json` → warning
   listing the problem (previously a crash).
2. `/profile` (no args) → help/description now shows `stats | rules | misroute` and `--once`.
3. Edit `bundles.json` mid-session → next prompt still shows the one-time
   `bundles.json changed (<hash>) — applied` notice (single-read path preserved it).
4. `git check-ignore -v .profile-router-telemetry.log .omp/misroutes.jsonl` → both matched
   (verified: `*.log` line 3, explicit entry line 118).
5. Pin a profile, send a prompt that scores another profile higher, inspect the last line of
   `.profile-router-telemetry.log` → `runnerUpProfile` is the competitor, `margin` negative.
