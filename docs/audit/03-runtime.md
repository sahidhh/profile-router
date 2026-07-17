# 03 — Runtime / Workflow Audit (full execution trace)

## Executive Summary

The complete per-prompt flow was traced through `before_agent_start`
(`profile-router.ts:450-596`). The pipeline is: config load → change-notice hash → classify →
manual-override substitution → merge → stickiness memory → counters → telemetry → optional
debug trace → status line → model confirm chain → thinking level → toolset → rules injection.
Found: 2 redundant disk reads, up to 2 redundant scoring passes, one wasted classify under
manual override, and two caching opportunities (compiled keyword regexes; combined read+hash).
All are CPU/IO micro-costs — none consume tokens.

## Step-by-step trace (adapted to this repo's actual pipeline)

| # | Step | Code | Notes |
|---|---|---|---|
| 1 | Prompt arrives | hook `before_agent_start` :450 | fires for every user prompt |
| 2 | Config load | `loadBundles` :451 | disk read #1 + JSON.parse; fail-open to `{profiles: []}` |
| 3 | Change notice | `configContentHash` :454 | **disk read #2 of the same file**; sha256 → 12-hex |
| 4 | Classify | `classify` :462 | scoring pass #1 over all profiles; stickiness fallback |
| 5 | Manual override | :467-488 | replaces matches; **step 4's work discarded** when pinned; stale pin auto-clears with warning |
| 6 | Merge | `merge` :490 | union/intersection/highest-score; suppression kill-set |
| 7 | Stickiness memory | :495 | winner name remembered for next turn |
| 8 | Counters | :498-499 | per-profile session counts |
| 9 | Telemetry | `explain` + `logTelemetry` :504-507 | scoring pass #2; appendFileSync; skipped for default routes |
| 10 | Debug trace | :510-521 | scoring pass #3 when `/profile debug on` |
| 11 | Status line | :524-529 | always set — the misroute tripwire |
| 12 | Model routing | :534-576 | resolve fallback chain; confirm memoized per (from→to); warn-once on unresolvable |
| 13 | Thinking level | :579-581 | silent |
| 14 | Toolset | :586-588 | only when merged tools non-empty (restriction persists otherwise — see ARCH-W2) |
| 15 | Rules injection | :591-594 | appended to `event.systemPrompt` for this run |

Other runtime surfaces: `session.compacting` (:617) adds active rules to the summarization
context (bias-only; believed-redundant, kept deliberately); `tool_call` (:628) blocks `task`
calls to disabled agents; `/profile` command (:692).

## Unnecessary / repeated / expensive work

- **RT-1 (repeated)**: same file read twice per prompt (steps 2+3). Fix: one read, hash the raw
  string, parse it. Also removes the read-twice consistency hazard.
- **RT-2 (repeated)**: `explain()` re-scores all profiles for telemetry and again for debug
  trace, duplicating `classify()`. Fix: compute the explain rows lazily once and share.
- **RT-3 (unnecessary)**: `classify()` runs even when a manual override will discard the result.
  Cheap; only worth folding into the RT-2 restructure if free.
- **RT-4 (cache opportunity)**: `scoreProfile` compiles ~2 RegExps per term per prompt (~150
  compilations/prompt for the shipped table). Could cache compiled regexes keyed by the config
  content hash. Measured scale makes this negligible — recorded, not recommended.
- **RT-5 (cache exists, correct)**: model confirm decisions (`modelDecisions`), unresolvable-
  model warnings, malformed-config warnings are all already memoized. Good.

## Handoff

```yaml
phase: runtime-workflow
status: complete
findings:
  - {id: RT-1, severity: low, confidence: high, summary: "Double disk read of bundles.json per prompt", files: [profile-router.ts]}
  - {id: RT-2, severity: low, confidence: high, summary: "explain() duplicates scoring up to 2 extra times per prompt"}
  - {id: RT-3, severity: info, confidence: high, summary: "classify() wasted under manual override"}
  - {id: RT-4, severity: info, confidence: high, summary: "Regex recompilation per prompt — negligible, not recommended"}
recommendations:
  - Single combined read+hash config load
  - Lazy shared explain-rows memo per prompt
next_phase_inputs:
  token_surfaces: [rules injection block, skills block, compaction context, UI notifications]
```
