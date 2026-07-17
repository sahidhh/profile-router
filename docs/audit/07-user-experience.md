# 07 — User Experience Audit

## Executive Summary

For a config-file-driven tool, the UX is unusually good: an always-visible status line, a full
`/profile` introspection suite (list/debug/explain/validate/stats/rules/misroute), hot config
reload with a change notice, precise error messages that list known profile names, and a
manual with troubleshooting and an acceptance test. The friction points are small but real:
the registered command help string omits four newer subcommands, model-switch confirms repeat
per session (decisions aren't persisted), telemetry is write-only (no in-session way to read
it), install is manual file copy, and misclassification recovery requires knowing the trigger
vocabulary.

## What works (verified in code/docs)

- **Feedback**: status line every prompt (`⚙ lookup`), debug trace with per-keyword attribution
  and confidence margin, `explain` for dry-runs, `validate` for structural checks.
- **Recovery**: `/profile <name>` pin, `--once` turn-scoped pin (auto-clears), `clear`,
  stale-pin auto-clear with warning, fail-open on all config/model errors.
- **Docs**: README (concept + optimal use), MANUAL (install/schema/runtime/troubleshooting/
  acceptance test), schema-driven editor autocomplete. Learning curve is genuinely shallow:
  "phrase prompts with trigger vocabulary" is the one thing to learn.

## Friction (ranked)

- **UX-1 — stale command help**: `registerCommand` description (`profile-router.ts:693-694`)
  lists only `[<name>|clear] | list | debug | validate | explain` — `stats`, `rules`,
  `misroute`, `--once` are invisible at the discovery surface users actually see. README/MANUAL
  have them, but the in-CLI string is the first (often only) touchpoint.
- **UX-2 — repeated model confirms**: `modelDecisions` memoizes per (from→to) *per session*.
  A user bouncing lookup↔implementation across sessions re-answers the same dialogs daily.
  No "always allow" or persisted decision store.
- **UX-3 — write-only telemetry**: `.profile-router-telemetry.log` and `.omp/misroutes.jsonl`
  accumulate exactly the data needed to tune vocabulary (and to close the D-F2 gate), but there
  is no `/profile` subcommand to summarize them; users must parse JSONL by hand.
- **UX-4 — magical moments**: silent thinking-level changes and toolset restriction are
  invisible until a tool is missing ("why can't it edit?") — especially the ARCH-W2 case where
  a *default* prompt inherits the previous profile's restricted toolset. The status line shows
  the profile but not the toolset consequence.
- **UX-5 — manual install** *(largely resolved mid-audit)*: upstream commit ac10d57 (pulled
  during this audit) added `npm run install:global` / `install:global:check` with sha-drift
  detection. Remaining sliver: project-local install (`.omp/extensions/`) is still manual copy.
- **UX-6 — validate ≠ crash-proof**: `/profile validate` passes configs that later crash
  classification (non-string keyword entries) and itself throws on `"capabilities": null`
  (`profile-router.ts:380` — `Object.keys(null)`), producing a raw error instead of a finding.

## Handoff

```yaml
phase: user-experience
status: complete
findings:
  - {id: UX-1, severity: low, confidence: high, summary: "Command help omits stats/rules/misroute/--once", files: [profile-router.ts]}
  - {id: UX-2, severity: medium, confidence: high, summary: "Model confirm decisions not persisted across sessions"}
  - {id: UX-3, severity: medium, confidence: high, summary: "Telemetry/misroute logs have no read/summary surface"}
  - {id: UX-4, severity: medium, confidence: medium, summary: "Silent toolset restriction persists into default turns; invisible to user"}
  - {id: UX-5, severity: info, confidence: high, summary: "Global install scripted upstream (ac10d57); project-local install still manual"}
  - {id: UX-6, severity: medium, confidence: high, summary: "validate crashes on capabilities:null; misses non-string keyword entries"}
```
