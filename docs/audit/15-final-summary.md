# 15 — Final Summary (for a first-time reader)

## What this project is

`profile-router` is a one-file extension for the OMP coding agent. Before every prompt you send,
it scores the prompt against a JSON table of "profiles" (lookup, hotfix, investigation,
implementation, architecture, review, premium) using plain keyword matching — no AI call, so
routing is free. The winning profile then: injects a short list of engineering rules into the
system prompt, proposes the right-priced model (cheap for lookups, Opus for schema/secret work,
with a one-tap confirm), sets the thinking level, restricts the toolset, and can block
subagents. You steer it by phrasing prompts with trigger words; you configure it by editing
`bundles.json`; the test suite fails if your edit makes profiles collide.

## Current maturity

High for its size. Strict TypeScript, zero runtime dependencies, 139 green tests including
regression locks for real production failures, CI, a user manual with a troubleshooting section
and acceptance test, and — unusually — an evidence trail: every upstream API call is proven at
file:line (`API-FINDINGS.md`) and every judgment call is logged (`DECISIONS.md`), including
beliefs that were later falsified and struck through rather than deleted. Two open items are
deliberately parked behind evidence gates (D-F1, D-F2).

## Strongest parts

1. Pure functional core, fully unit-tested, cleanly separated from the OMP-coupled shell.
2. Safety-conservative merge semantics (union rules, intersect disables, tagged suppression).
3. Fail-open error posture with warn-once memoization — a bad config never blocks a prompt.
4. The authoring safety net: reachability + paraphrase-fixture + golden tests co-test the
   real `bundles.json`.
5. Evidence/decision culture that makes autonomous maintenance safe.

## Weakest parts

1. Validator gaps that let a "validated" config crash routing (and one validator crash).
2. Telemetry correctness quirk that pollutes the exact data an open decision gate depends on.
3. Silent toolset persistence into no-match turns (documented trade-off, still a user trap).
4. The feedback loop is write-only: routing evidence is collected but has no read surface.
5. Session-scoped model-confirm memory → repeated dialogs across sessions.

## Most valuable improvements / top reductions

- **Cost**: routing accuracy is the money lever — log default routes, ship a telemetry summary
  command, then resolve D-F2 by its documented decision tree (also fixes co-match rule bloat
  and the subagent-ban leak). The extension's own token overhead is already minimal
  (~150–400 tokens/matched prompt of deliberate rules injection).
- **UX**: complete the in-CLI help (done this cycle), persist model decisions, make toolset
  restriction visible/restorable.
- **QoL**: crash-proof validation (done), consistent single-read config load (done), correct
  telemetry (done), privacy gitignore (done), install script, CI `npm ci` + matrix.

## Recommended roadmap

Immediate fixes landed on `audit/qol-hardening` (see `docs/changes/`). Short term: telemetry
read surface + default-route logging + install script + CI hardening. Medium term: gated
toolset restore, persisted model decisions. Long term: D-F2 resolution from telemetry data,
D-F1 verification, deliberate OMP bumps. Full details: `12-roadmap.md`.

## Scores (1–10, calibrated to project scope)

| Dimension | Score | Rationale |
|---|---|---|
| Repository maturity | 8 | tests+CI+docs+decision log; minus validator gaps, no coverage metric |
| Architecture | 8.5 | clean core/shell split; minus per-prompt duplication (fixed), toolset asymmetry |
| Maintainability | 8 | evidence culture, strict TS; minus if-chain handler, 2000-line test file |
| Developer experience | 8 | one-command gate, hot reload, schema autocomplete, scripted global install (ac10d57) |
| User experience | 7.5 | status line + introspection suite; minus stale help (fixed), repeated confirms, write-only telemetry |
| Cost efficiency | 9 | zero-cost classifier, tiered routing, fallback chains; minus co-match bloat (gated) |
```
