# 05 — Dependency Analysis

## Executive Summary

Runtime dependency count: **zero** (Node built-ins only) — the strongest possible position for
a copy-one-file extension. Dev dependencies: `typescript ^7.0.2`, `@types/node ^26.1.1`, and
`@oh-my-pi/pi-coding-agent` pinned **exactly** at `16.4.1`. The exact pin is documented as
deliberate (upstream release cadence; API verified per-version in API-FINDINGS.md). The real
dependency risk is not a package — it is the **behavioral contract** with OMP internals that the
extension has verified at file:line granularity for 16.4.1 only.

## Analysis

- **DEP-1 — upstream contract drift (accepted risk, well-managed)**: API-FINDINGS.md proves each
  API against 16.4.1 source. A version bump invalidates those proofs; README correctly makes
  bumping "a manual, deliberate action" followed by `npm run check`. The reachability tests
  cover routing semantics but cannot detect upstream *hook-semantics* changes (e.g. if
  `systemPrompt` handling in compaction changed, the believed-redundant `session.compacting`
  handler's rationale would silently rot). UPSTREAM.md correctly quarantines OMP-owned issues.
- **DEP-2 — `--experimental-strip-types` coupling**: tests depend on a Node flag, not a package;
  tracked as BP-2.
- **DEP-3 — model-catalog coupling**: `bundles.json` model strings are data-level dependencies
  on provider catalogs (verified against the installed catalog per DECISIONS Phase 7/8). The
  fallback-chain design (`model: string[]`) plus warn-once degradation makes stale strings
  fail soft. Good design.
- **Supply chain**: lockfile committed; no postinstall scripts in the dep tree relevant to
  runtime (extension itself imports nothing third-party). CI should use `npm ci` (BP-1).

## Handoff

```yaml
phase: dependency-analysis
status: complete
findings:
  - {id: DEP-1, severity: medium, confidence: high, summary: "Behavioral contract with OMP internals verified only for 16.4.1; bump invalidates proofs (documented, accepted)"}
  - {id: DEP-2, severity: low, confidence: high, summary: "Test runner depends on experimental Node flag"}
  - {id: DEP-3, severity: low, confidence: high, summary: "Model strings are catalog-coupled but fail soft via fallback chains"}
```
