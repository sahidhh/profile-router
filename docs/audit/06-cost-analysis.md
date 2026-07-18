# 06 — Token Cost Audit

## Executive Summary

This extension is a **cost-reduction mechanism whose own overhead is already near zero**: the
classifier makes no LLM calls, and the only tokens it adds are the injected rules/skills block.
Honest accounting: the injection block costs roughly 150–400 tokens per matched prompt
(resent with the system prompt on every model call in the run); everything else (status line,
notifications, telemetry) is UI/disk, not model context. The largest *available* savings are not
in the extension's own overhead but in (a) co-match rule-union bloat and (b) routing accuracy —
both already instrumented via telemetry. No "Very High" savings exist; claiming otherwise would
be exaggeration.

## Where tokens are consumed

| Surface | Size (est.) | Frequency | Classification |
|---|---|---|---|
| Rules block (`## Active Engineering Rules`) | ~100–300 tokens (4–8 rules × ~15–25 tokens) | every model call of a matched run (system prompt resend) | inherent — this is the product |
| Skills block (`## Recommended Skills`) | ~10–40 tokens (names only) | same | inherent |
| Co-match union bloat (e.g. lookup+investigation) | +60–150 tokens of off-profile rules | on multi-match prompts | **COST-01, reducible** |
| `commonRules` truncation rule | ~35 tokens, declared once, injected once | every matched run | already optimized (T3 lifted it from 7 duplicates to 1) |
| `session.compacting` context | ~100–300 tokens into the *summarizer* call only | rare (compaction events) | negligible; bias-only |
| Classifier | 0 tokens | — | by design |

## Findings

- **COST-01 (Medium)** — Multi-profile co-match unions rules from both profiles. D-F2's live
  example: orientation prompts co-match lookup+investigation, adding investigation's
  reproduce/root-cause rules (~5 rules ≈ 100+ tokens) to a cheap flash-lite lookup, on every
  model call of that run — plus the gated subagent-ban leak (a *behavioral* cost far larger
  than the tokens if a "cheap lookup" fans out subagents on a big repo). Savings: ~100–150
  tokens/call on affected prompts, plus avoided subagent fan-out. **Fix is gated on telemetry
  (D-F2) — respect the gate.**
- **COST-02 (Low)** — Routing accuracy is the dominant real-money lever: every prompt misrouted
  from `lookup`/`hotfix` up to Sonnet-class costs orders of magnitude more than any prompt-block
  trimming. Telemetry (margin + runner-up) and `misroutes.jsonl` already exist to tune this;
  what's missing is an easy way to *read* them (see 08-qol: telemetry summary command). Default
  (no-match) routes are currently **not** logged (`profile-router.ts:504`), which hides exactly
  the prompts where vocabulary is missing — the highest-value tuning data.
- **COST-03 (Low)** — Rule wording: several profiles carry a ~25-token escape-hatch sentence
  ("If the request exceeds read-only scope…") repeated verbatim in 4 profiles. It deliberately
  survives suppression (T06 golden test); moving it to `commonRules` would change semantics
  (write profiles would receive it). Only a wording-tightening pass could shave ~10–30
  tokens/prompt. Not worth semantic risk now.
- **COST-04 (None)** — Extension-side CPU work (double read, triple scoring) consumes zero
  tokens; fixed for hygiene, not cost (RT-1/RT-2).

## Realistic savings estimate

- Co-match trimming (post-gate): Medium — tens to ~150 tokens/call on a minority of prompts;
  the subagent-leak fix is the real value.
- Telemetry-driven vocabulary tuning: Medium over time — moves whole prompts between price
  tiers; unquantifiable until the telemetry corpus exists (the gate is doing its job).
- Everything else: Low.

## Handoff

```yaml
phase: cost-audit
status: complete
findings:
  - {id: COST-01, severity: medium, confidence: high, summary: "Co-match rule-union bloat + gated subagent-ban leak (D-F2)", files: [bundles.json, profile-router.ts]}
  - {id: COST-02, severity: medium, confidence: high, summary: "Default routes not telemetry-logged; misses highest-value tuning data", files: [profile-router.ts]}
  - {id: COST-03, severity: low, confidence: medium, summary: "Escape-hatch sentence repeated in 4 profiles; semantic risk to dedupe"}
recommendations:
  - Log default routes in telemetry (chosenProfile: "default")
  - After D-F2 gate: minScore or verbs/scopes split per the documented decision tree
```
