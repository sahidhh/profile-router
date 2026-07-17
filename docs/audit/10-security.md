# 10 — Security Audit

## Executive Summary

Attack surface is small and mostly local-trust: no network calls, no shell execution, no
third-party runtime deps, regex inputs escaped (no injection/ReDoS from config terms). The two
real items are data-handling, not exploitation: **prompt text is persisted to plaintext files**
(telemetry: 200 chars, auto, every matched route; misroutes: 500 chars, user-initiated), and
the misroutes file is not gitignored — ironic because the `premium` profile exists precisely
because prompts sometimes contain the words "secret/credential/token/password", and those are
the prompts guaranteed to be telemetry-logged. Enforcement-boundary note: profile "guardrails"
are prompt-level, not sandbox-level — documented honestly, but worth restating.

## Findings

- **SEC-1 (Medium, privacy)** — `.profile-router-telemetry.log` records the first 200 chars of
  every matched prompt to the project cwd. It *is* covered by the existing `*.log` gitignore
  rule (verified), so it won't be committed, but it persists on disk indefinitely and is
  append-only. A prompt like "rotate the password X to Y" is stored verbatim. Mitigations:
  document in MANUAL; consider redacting after the trigger analysis window; consider making
  telemetry opt-out.
- **SEC-2 (Low→Medium, privacy)** — `.omp/misroutes.jsonl` (500-char prompts) is **not**
  gitignored, and `.omp/` contains `bundles.json` which users *do* commit — high chance of
  accidental commit of prompt text. Fix: one gitignore line (QOL-10).
- **SEC-3 (Info, enforcement boundary)** — `disabledAgents` blocks only `task` tool calls;
  `tools` restriction relies on OMP honoring `setActiveTools`; rules are prose in a system
  prompt. None of this is a security boundary against a hostile model or prompt-injection —
  it's cost/behavior steering. The docs don't overclaim, but MANUAL could state it explicitly.
- **SEC-4 (Info)** — Config is `JSON.parse`d and fields read directly (no merge into
  prototypes); `escapeRegExp` neutralizes regex metacharacters in keywords; file writes are
  `appendFileSync`/`mkdirSync` under cwd/`~/.omp`. No path traversal from config values (no
  config-controlled paths). Sound.
- **SEC-5 (Info, supply chain)** — dev-only deps, committed lockfile, exact-pinned upstream.
  CI `npm ci` (BP-1) would complete the story.

## Handoff

```yaml
phase: security
status: complete
findings:
  - {id: SEC-1, severity: medium, confidence: high, summary: "Prompt text persisted to plaintext telemetry log (gitignored but on-disk, append-only)", files: [profile-router.ts]}
  - {id: SEC-2, severity: medium, confidence: high, summary: ".omp/misroutes.jsonl (prompt text) not gitignored; sits next to committed bundles.json", files: [.gitignore]}
  - {id: SEC-3, severity: info, confidence: high, summary: "Guardrails are steering, not enforcement — worth an explicit MANUAL note"}
recommendations:
  - Add .omp/misroutes.jsonl to .gitignore now
  - MANUAL note on telemetry contents + retention
```
