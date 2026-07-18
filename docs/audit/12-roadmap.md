# 12 — Roadmap / Implementation Planning

## Executive Summary

Four horizons. Immediate = the five low-risk fixes implemented in this audit cycle (E1–E5).
Short term = feedback-loop tooling (telemetry read surface, default-route logging, install
script, CI hardening). Medium term = the two gated/persistence items (toolset restore after API
verification; persisted model decisions). Long term = the D-F2 co-match resolution (decided by
the telemetry corpus per the documented decision tree) and upstream-driven work (skills
filtering after D-F1 verification, OMP version bumps).

## Immediate (this cycle — branch `audit/qol-hardening`)

| Item | Modules | Effort | Migration risk | Breaking |
|---|---|---|---|---|
| E1 help string | profile-router.ts | minutes | none | no |
| E2 validator hardening | profile-router.ts + tests | ~1h | none (strictly more problems reported; crash removed) | no* |
| E3 single read + single scoring pass | profile-router.ts | ~1h | none (behavior-preserving) | no |
| E4 telemetry runner-up fix | profile-router.ts + tests | ~30m | telemetry rows change meaning only in pin/sticky cases (more correct) | no |
| E5 gitignore misroutes | .gitignore | minutes | none | no |

\* E2 caveat: configs that previously "passed" validate but crashed at runtime will now report
problems — that is the fix, not a break.

## Short term (next 1–2 sessions)

- E6: `/profile telemetry` summary + default-route logging — depends on: none; coordinate with
  D-F2 gate review. Affected: profile-router.ts, tests, README/MANUAL.
- QOL-9 install script — global variant already landed upstream (ac10d57); optional
  project-local variant remains.
- QOL-11 CI: `npm ci` + Node matrix — .github/workflows/ci.yml.
- TD-4 decision: delete or empower `CONTINUATION_PHRASES` (owner call; either is small).
- MANUAL: telemetry privacy/retention note (SEC-1); steering-not-enforcement note (SEC-3).

## Medium term

- E7 toolset restore — **gate**: one-time verification that the pinned OMP API can enumerate
  the active/full toolset; then design restore-on-empty-merge. Affected: profile-router.ts,
  API-FINDINGS.md, tests. Migration risk: low; breaking: no.
- E8 persist model decisions (opt-in) — profile-router.ts, schema (maybe), MANUAL.
- QOL-12 status-line 🔒 marker; dispatch-table refactor of the command handler (trigger: E6).

## Long term

- **D-F2 resolution** after ~1 week of (now-corrected) telemetry: `minScore: 3` on
  investigation if repo-class co-matches are rare, else the full verbs/scopes split. Do not
  pre-empt; the decision tree is already written in DECISIONS.md.
- **D-F1 skills filtering** only after the `.js` `buildSystemPrompt` verification.
- OMP version bump ritual: bump → re-verify API-FINDINGS anchors → `npm run check`.

## Handoff

```yaml
phase: roadmap
status: complete
immediate: [E1, E2, E3, E4, E5]
short_term: [E6, QOL-9, QOL-11, TD-4-decision, MANUAL-notes]
medium_term: [E7-gated, E8, QOL-12, dispatch-refactor]
long_term: [D-F2-resolution, D-F1-verification, upstream-bumps]
```
