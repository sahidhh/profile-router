# 08 — Quality of Life Audit

## Executive Summary

Twelve realistic QoL opportunities, none speculative. The highest-leverage cluster is
"close the feedback loop": the tool already *collects* routing evidence (telemetry, misroutes,
stats) but gives the user no way to consume it. Second cluster: crash-proof validation and
accurate help text (cheap, immediate). Third: persistence (model decisions, session-crossing
state). Deliberately excluded: anything touching the D-F1/D-F2 gates, and heavy machinery
(interactive graphs, execution visualization) that would violate the single-file zero-dep
design premise.

## Opportunities

| ID | Improvement | Value | Effort |
|---|---|---|---|
| QOL-1 | Complete the `/profile` help string (stats/rules/misroute/--once) | discoverability | trivial |
| QOL-2 | Harden `validateBundles`: no crash on `capabilities: null`; flag non-string entries in `keywords`/`verbs`/`scopes`/`excludeKeywords`; validate `minScore` is a number | prevents runtime crash from "validated" config | small |
| QOL-3 | Single read+hash config load; lazy shared explain-rows (RT-1/RT-2) | consistency + hygiene | small |
| QOL-4 | Fix telemetry runner-up/margin under manual pin / stickiness (ARCH-W5) | trustworthy tuning data | small |
| QOL-5 | Log default routes in telemetry (`chosenProfile: "default"`) | captures missing-vocabulary prompts — the best tuning data | small |
| QOL-6 | `/profile telemetry` summary subcommand: routes per profile, low-margin routes, default-route count read from the log | closes the feedback loop; directly serves the D-F2 gate review | medium |
| QOL-7 | Persist `modelDecisions` to `.omp/model-decisions.json` (opt-in) | kills repeated confirm dialogs | medium |
| QOL-8 | Baseline-toolset restore on no-match turns (needs OMP API to enumerate current tools — verify first, D-F1-style gate) | removes the silent restriction trap (ARCH-W2/UX-4) | medium+gate |
| QOL-9 | Install script — **global variant landed upstream mid-audit** (ac10d57: `npm run install:global` + `--check` drift detection); remaining: project-local variant | removes the `agent/` path trap | mostly done |
| QOL-10 | `.gitignore`: add `.omp/misroutes.jsonl` (raw prompt text; telemetry already covered by `*.log`) | privacy default | trivial |
| QOL-11 | CI: `npm ci` + Node version matrix | reproducibility | trivial |
| QOL-12 | Status line: append a marker when the toolset is restricted (e.g. `⚙ lookup 🔒`) | makes the magic visible | small |

Session resume / checkpointing / automatic retries: OMP owns sessions; the extension's
per-prompt statelessness (re-read config, re-classify) already makes it resume-safe. Nothing
to build here beyond QOL-7 persistence.

## Handoff

```yaml
phase: qol
status: complete
recommendations_immediate: [QOL-1, QOL-2, QOL-3, QOL-4, QOL-10]
recommendations_short_term: [QOL-5, QOL-6, QOL-9, QOL-11, QOL-12]
recommendations_gated_or_medium: [QOL-7, QOL-8]
```
