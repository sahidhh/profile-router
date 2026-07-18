# 02 — Architecture Audit

## Executive Summary

Deliberate two-layer architecture: a pure, exported functional core (load/score/classify/
explain/merge/validate) and a thin stateful extension shell wired to three OMP hooks and one
command. Dependency direction is clean (shell → core → Node built-ins; core never touches OMP
types). Strengths: testability, zero runtime deps, config-as-API, documented decisions.
Weaknesses: per-prompt duplicate work (double config read, up to triple scoring pass),
asymmetric toolset application (restrictions persist into no-match turns by documented design),
one dead-logic construct, and a command-handler function growing past 190 lines with repeated
`loadBundles` boilerplate per subcommand.

## Organization & boundaries

- `profile-router.ts` — everything. Sections are comment-delimited: Types → Config loading →
  Classification → Merge → Validation → Extension. For 884 lines, a single file is the right
  call (single-file install is a feature: copy one file + one JSON).
- `bundles.json` — the only authoring surface; `bundles.schema.json` gives editor validation.
- Coupling to OMP is confined to the extension shell (`ExtensionAPI`, `ctx.*`, `pi.*`); every
  API call is evidence-verified in `API-FINDINGS.md`. This is an unusually disciplined boundary.

## State management

All session state lives in the factory closure (`active`, `manualOverride`/`Once`,
`stickyPrevProfile`, `modelDecisions`, counters, `lastConfigHash`, `debugTrace`). Nothing global
except `warnedPaths` (process-level, intentional: warn-once across reloads) and the `DEBUG` env
flag. Persistence is append-only JSONL files (telemetry, misroutes). Clean.

## Config / extension points

- Profile schema is expressive: `keywords`/`verbs`/`scopes` (weighted two-axis scoring),
  `excludeKeywords` (hard disqualify), `minScore`, `capabilities` (declarative), tagged rules +
  `suppresses` (co-match negation), model fallback chains, `default.commonRules` (shared wording
  declared once).
- Hot reload: config re-read every prompt; content-hash change notice. No restart needed.

## Weaknesses (no fixes proposed here — see 09/13)

- **W1 — duplicate per-prompt work**: `loadBundles` and `configContentHash` each read the same
  file (`profile-router.ts:76`, `:103`); telemetry and debug-trace each call `explain()`
  (`:505`, `:517`) after `classify()` already scored all profiles (`:462`). Up to 2 disk reads +
  3 scoring passes per prompt. Milliseconds, not tokens — but also a consistency hazard (file
  could change between the two reads, making the notice hash and the applied config diverge).
- **W2 — toolset asymmetry**: `setActiveTools` fires only when merged `tools` is non-empty
  (`:586-588`). Documented rationale (never strip tools via `setActiveTools([])`), but the dual:
  after a restricted profile (e.g. `lookup`), a no-match/default prompt **keeps the read-only
  toolset**. Restoring needs a way to enumerate the baseline toolset — not verified available in
  the pinned OMP API.
- **W3 — dead logic**: every `CONTINUATION_PHRASES` entry (`:182-195`) is < 6 tokens, so the
  `tokenCount < 6` clause (`:201`) already accepts all of them; the set membership test can
  never change the outcome.
- **W4 — command handler shape**: `/profile` handler (`:695-882`) is a 190-line if-chain; 6 of 9
  subcommands re-call `loadBundles` with identical notify plumbing. Tolerable, but the next
  subcommand added should trigger a dispatch-table refactor.
- **W5 — telemetry margin model**: `logTelemetry` (`:426`) assumes the chosen profile is the top
  scorer; under a manual pin or sticky inheritance the logged runner-up/margin is wrong (can go
  negative).
- **W6 — known merge leak (gated)**: lookup+investigation co-match lifts lookup's subagent ban
  via `disabledAgents` intersection — documented as D-F2 with an explicit wait-for-telemetry
  gate. Do not fix ahead of the gate.

## Strengths

- Pure core = 100% of routing semantics unit-testable without OMP; the reachability/golden
  suites lock real production regressions.
- Safety-conservative merge defaults (intersection for disabling, union for rules; suppression
  is opt-in and tag-scoped; untagged rules can never be suppressed).
- Fail-open error handling with warn-once memoization everywhere user-visible.
- Evidence culture: API-FINDINGS.md file:line proofs; DECISIONS.md numbered judgments;
  falsified beliefs are struck through rather than deleted (see `session.compacting` comment).

## Handoff

```yaml
phase: architecture
status: complete
findings:
  - id: ARCH-W1
    severity: low
    confidence: high
    summary: Double config read + up to triple scoring pass per prompt
    files: [profile-router.ts]
  - id: ARCH-W2
    severity: medium
    confidence: high
    summary: Tool restriction persists into subsequent no-match turns (documented trade-off; restore needs unverified API)
  - id: ARCH-W3
    severity: low
    confidence: high
    summary: CONTINUATION_PHRASES set is unreachable logic (all entries < 6 tokens)
  - id: ARCH-W4
    severity: low
    confidence: high
    summary: /profile handler is a 190-line if-chain with repeated loadBundles plumbing
  - id: ARCH-W5
    severity: low
    confidence: high
    summary: Telemetry runner-up/margin wrong when chosen profile is not top scorer
  - id: ARCH-W6
    severity: medium
    confidence: high
    summary: lookup+investigation co-match lifts subagent ban (GATED by D-F2 — do not fix yet)
next_phase_inputs:
  workflow_trace_anchor: profile-router.ts:450-596
```
