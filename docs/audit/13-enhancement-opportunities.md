# 13 — Enhancement Proposals

## Executive Summary

Eight concrete proposals, each evidence-backed. E1–E5 are the low-risk set selected for
implementation in this audit cycle; E6–E8 are designed but deferred (one needs an API
verification gate, one waits on the D-F2 telemetry gate, one is a UX addition worth its own
review). No speculative ideas included.

---

### E1 — Complete the `/profile` command help string
- **Problem**: in-CLI help omits `stats`, `rules`, `misroute`, `--once` (UX-1).
- **Evidence**: `profile-router.ts:693-694` vs. subcommands at :766, :792, :810, :845.
- **Reasoning**: the description is the primary discovery surface; four shipped features are invisible.
- **Complexity/Risk**: trivial / none. **Benefit**: discoverability. **Tokens**: n/a.
- **Difficulty**: trivial. **Priority**: Immediate.

### E2 — Harden `validateBundles` against crash-inducing configs
- **Problem**: `capabilities: null` crashes the validator itself; non-string `keywords`/`verbs`/
  `scopes`/`excludeKeywords` entries pass validation then crash `classify()` at routing time (TD-1/TD-2).
- **Evidence**: `Object.keys(null)` at :380 (shape check runs *after* key enumeration);
  `term.toLowerCase()` at :129/:162 with no string check upstream; validator only checks
  `Array.isArray(p.keywords)`.
- **Reasoning**: `/profile validate`'s contract is "catch mistakes before they bite"; a config
  that passes validation must not crash the hook.
- **Complexity/Risk**: small / low (additive checks + reordered guard; new tests).
- **Benefit**: crash-proof validation. **Priority**: Immediate.

### E3 — Single config read + single scoring pass per prompt
- **Problem**: RT-1/RT-2 — `bundles.json` read twice; profiles scored up to 3×.
- **Evidence**: `loadBundles` :451 + `configContentHash` :454; `explain()` at :505 and :517
  after `classify()` at :462.
- **Reasoning**: hygiene + consistency (hash and parsed config can currently come from
  *different file states* if the file changes between the two reads).
- **Complexity/Risk**: small / low — pure refactor, behavior-preserving, fully covered by
  existing config-change-notice and telemetry tests.
- **Benefit**: consistency guarantee; ~1 fewer disk read + up to 2 fewer scoring passes per prompt.
- **Priority**: Immediate.

### E4 — Correct telemetry runner-up/margin under pin/stickiness
- **Problem**: TD-3 — margin can be negative and runner-up wrong when the chosen profile isn't
  the top scorer; this pollutes the dataset the D-F2 gate will be decided on.
- **Evidence**: `logTelemetry` :426 takes `explain_rows[1]` unconditionally.
- **Reasoning**: runner-up must be the best-scoring profile *other than the chosen one*.
- **Complexity/Risk**: small / low (pure function change + test). **Priority**: Immediate —
  the telemetry collection week is running now; fix before more data accrues.

### E5 — Gitignore `.omp/misroutes.jsonl`
- **Problem**: SEC-2 — raw prompt text in a directory users commit.
- **Complexity/Risk**: trivial / none. **Priority**: Immediate.

### E6 — `/profile telemetry` summary subcommand (QOL-6) + log default routes (QOL-5/COST-02)
- **Problem**: telemetry is write-only; default routes (missing-vocabulary prompts) unlogged.
- **Risk**: low, but changes the log's row population mid-collection-window and adds a new
  command surface — should land as its own reviewed change, ideally right when the D-F2 gate
  review happens so the analysis command and the analysis are designed together.
- **Priority**: Short term.

### E7 — Baseline-toolset restore (ARCH-W2/UX-4)
- **Gate**: verify the pinned OMP API exposes a way to read the current/full toolset before
  designing (same discipline as D-F1). **Priority**: Medium term.

### E8 — Persist model decisions (UX-2, QOL-7)
- Opt-in `.omp/model-decisions.json`; invalidate on catalog change. **Priority**: Medium term.

## Handoff

```yaml
phase: enhancement-proposals
status: complete
selected_for_implementation: [E1, E2, E3, E4, E5]
deferred: [E6 short-term, E7 gated, E8 medium-term]
explicitly_not_touched: [D-F1 skills filtering, D-F2 co-match fix, CONTINUATION_PHRASES removal (owner decision)]
```
