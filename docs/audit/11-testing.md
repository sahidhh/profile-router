# 11 — Testing Audit

## Executive Summary

139 tests / 28 suites, all green, `node:test` with zero test deps. Coverage philosophy is
exemplary for the domain: pure-core unit tests, **reachability tests** (every profile must win
its own trigger prompt — the keyword-collision safety net), a **paraphrase fixture suite**
(`test/fixtures/routing-expectations.json`) guarding semantic-overlap regressions, **golden
tests** locking real production failures, and extension-shell tests driven through a mock
`ExtensionAPI`. Gaps: the crash paths found in this audit are untested (they'd have been caught),
no coverage measurement, and behavioral gaps around toolset persistence and telemetry-under-pin.

## What exists (verified by running the suite)

- classify/merge/explain/validate unit suites incl. suppression symmetry, commonRules dedup,
  disabledAgents intersection, tiebreaks, claimed-span overlap dedup.
- Regression describes: F2 stale-pin, F3 warn-once, model fallback chains, config-change
  notice, `--once` lifecycle (4 tests), stickiness phrases, repo-scope routing, T2/T04-06
  invariant tests that iterate the *real* bundles.json (config and code are co-tested — a
  bundles.json edit can fail the suite; this is the intended authoring safety net).
- Telemetry: 4 tests (append-only, fields, truncation, margin).

## Gaps

- **TEST-1**: no test feeds `validateBundles` a `capabilities: null` or non-string keyword —
  both latent crashes (TD-1/TD-2) would have been caught by hostile-config tests. Add a
  malformed-config table test.
- **TEST-2**: telemetry under manual pin / sticky inheritance untested (TD-3's wrong margin).
- **TEST-3**: toolset persistence across a restricted→default prompt sequence untested
  (ARCH-W2) — the mock harness already drives multi-turn sequences, so this is testable today.
- **TEST-4**: no coverage tooling. `node --experimental-test-coverage` is a zero-dep option;
  even a one-off run to find untested branches would pay for itself.
- **TEST-5**: CI runs one Node version (BP-2).

## Handoff

```yaml
phase: testing
status: complete
findings:
  - {id: TEST-1, severity: medium, confidence: high, summary: "No hostile-config tests for validateBundles crash paths"}
  - {id: TEST-2, severity: low, confidence: high, summary: "Telemetry under pin/stickiness untested"}
  - {id: TEST-3, severity: low, confidence: high, summary: "Toolset persistence across turns untested"}
  - {id: TEST-4, severity: low, confidence: medium, summary: "No coverage measurement (zero-dep option exists)"}
```
