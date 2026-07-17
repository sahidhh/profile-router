# 09 — Engineering Quality & Technical Debt

## Executive Summary

Engineering quality is high for the project's size: strict TS, 139 green tests including golden
regression locks and a paraphrase fixture suite, evidence-backed API usage, and a decision log
that records falsified beliefs instead of deleting them. Debt is small and enumerable: one
latent crash in the validator, dead logic in stickiness, a stale help string, a telemetry
correctness quirk, an if-chain command handler nearing its complexity budget, and process
artifacts (`.orch/`, `salvage/`, root-level reports) accumulating at repo root.

## Maintainability / readability

- Comment discipline is excellent — comments state constraints and verified evidence
  (e.g. the `session.compacting` block cites upstream file:line for why it's redundant).
- `test/profile-router.test.ts` at 2000 lines is one file; still navigable via describe blocks.
  Split threshold: next major feature. Not urgent.
- `/profile` handler if-chain (ARCH-W4): refactor to a dispatch table on the next subcommand
  addition (QOL-6 would be that trigger).

## Correctness debt

- **TD-1**: `validateBundles` crashes on `"capabilities": null` (`Object.keys(null)`,
  `profile-router.ts:380`); check order inverted (keys read before shape check).
- **TD-2**: validator misses non-string entries in `keywords`/`verbs`/`scopes`/
  `excludeKeywords` — `classify()` then throws `term.toLowerCase is not a function` at routing
  time, i.e. a config that *passed validation* crashes the hook.
- **TD-3**: telemetry runner-up assumes chosen == top scorer (ARCH-W5); wrong (possibly
  negative margin, wrong runner-up name) under manual pin or sticky inheritance — pollutes the
  exact dataset the D-F2 gate depends on.
- **TD-4**: `CONTINUATION_PHRASES` is unreachable (every phrase < 6 tokens; the `tokenCount <
  6` disjunct subsumes it). Either delete it or make it meaningful (check phrases regardless of
  length). Owner decision — it encodes intent (commit 4028f43 deliberately extended it).

## Hygiene debt

- **TD-5**: repo root carries process artifacts: `API-FINDINGS.md`, `DECISIONS.md`,
  `VERIFICATION-REPORT.md`, `UPSTREAM.md`, `.orch/`, `salvage/`. Valuable provenance, but the
  root now has 6 markdown files competing with README/MANUAL. Consider `docs/provenance/`.
  Cosmetic; links in README would need updating.
- **TD-6**: stale command help (UX-1).
- **TD-7**: CI `npm install` vs `npm ci`; single Node version (BP-1/BP-2).
- **TD-8**: `.omp/misroutes.jsonl` not gitignored (raw prompts; privacy default — QOL-10).

## Error handling & performance

Fail-open with warn-once memoization is applied consistently — this is the right posture for a
routing extension (never block the user's prompt). Performance: everything is O(profiles ×
terms) regex on one prompt string; negligible. Telemetry files grow unboundedly by design
(append-only); acceptable for JSONL logs, worth a one-line note in MANUAL.

## Dead code

Only TD-4. No unused exports found; `session.compacting` is deliberately-retained
believed-redundant code with full justification — not debt.

## Handoff

```yaml
phase: technical-debt
status: complete
findings:
  - {id: TD-1, severity: medium, confidence: high, summary: "validateBundles crashes on capabilities:null", files: [profile-router.ts]}
  - {id: TD-2, severity: medium, confidence: high, summary: "Validator passes configs that crash classify() (non-string terms)"}
  - {id: TD-3, severity: medium, confidence: high, summary: "Telemetry margin/runner-up wrong under pin/stickiness; pollutes D-F2 gate data"}
  - {id: TD-4, severity: low, confidence: high, summary: "CONTINUATION_PHRASES unreachable; owner decision to delete or empower"}
  - {id: TD-5, severity: info, confidence: high, summary: "Process artifacts crowd repo root"}
  - {id: TD-8, severity: low, confidence: high, summary: ".omp/misroutes.jsonl not gitignored"}
```
