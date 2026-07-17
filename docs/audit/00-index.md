# Audit Index — profile-router (2026-07-17)

Full-repository audit, executed sequentially in a single session (no subagents spawned — the
codebase is one 884-line source file plus config/tests; fan-out would have cost more context
than it saved; rationale in `agent-logs/orchestrator-log.md`). Every phase report ends with a
structured YAML handoff block; the orchestrator consumed only those blocks.

Baseline at audit start: `main` @ bb40879, clean tree, `npm run check` green (139/139 tests).
Mid-audit, `git pull` advanced main to eadda44 (global install script — `profile-router.ts`
unchanged); affected findings (UX-5/QOL-9) were updated in place.

| Doc | Phase | One-line takeaway |
|---|---|---|
| [01-project-overview](01-project-overview.md) | 1 | Zero-LLM keyword router for OMP; single file, zero runtime deps |
| [02-architecture](02-architecture.md) | 2 | Clean core/shell split; 6 weaknesses (W1–W6), 2 gated |
| [03-runtime](03-runtime.md) | 3 | Full 15-step prompt trace; double read + triple scoring found |
| [04-build-pipeline](04-build-pipeline.md) | — | No build by design; CI should use `npm ci` + matrix |
| [05-dependency-analysis](05-dependency-analysis.md) | — | Zero runtime deps; real risk is the verified-per-version OMP contract |
| [06-cost-analysis](06-cost-analysis.md) | 4 | Own overhead ~150–400 tok/prompt; real lever is routing accuracy |
| [07-user-experience](07-user-experience.md) | 5 | Strong introspection; stale help, repeated confirms, write-only telemetry |
| [08-qol-improvements](08-qol-improvements.md) | 6 | 12 realistic QoL items, 5 selected for immediate implementation |
| [09-technical-debt](09-technical-debt.md) | 7 | 8 debt items; 2 latent crashes, 1 dead construct |
| [10-security](10-security.md) | 7 | No exploit surface; prompt-text persistence is the real item |
| [11-testing](11-testing.md) | 7 | 139 tests, exemplary philosophy; hostile-config gap |
| [12-roadmap](12-roadmap.md) | 10 | Immediate/short/medium/long horizons with gates respected |
| [13-enhancement-opportunities](13-enhancement-opportunities.md) | 9 | 8 proposals; E1–E5 selected, E6–E8 deferred |
| [14-recommended-workflow](14-recommended-workflow.md) | 8 | Autonomous loop mapped onto the repo's own profiles |
| [15-final-summary](15-final-summary.md) | 11 | Scores + newcomer-readable summary |

Implementation of the selected changes (E1–E5): branch `audit/qol-hardening`, documented in
`docs/changes/`.
