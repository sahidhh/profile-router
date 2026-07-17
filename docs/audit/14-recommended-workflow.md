# 14 — Recommended Autonomous Workflow

## Executive Summary

The repo's own profile system is the workflow engine: a self-sustaining loop should route each
stage through the profile designed for it (lookup → architecture → implementation → review →
premium when triggered), use the reachability/golden test suite as the verification gate, git
commits as checkpoints, and the telemetry/misroute corpus as the feedback stage. Human
intervention points are already correctly placed (model-switch confirms, premium triggers,
review's 2-fix-cycle escalation cap); the missing piece for "rarely needs a second opinion" is
the telemetry read surface (QOL-6) so tuning decisions are data-driven instead of vibes.

## The loop (maps to discover→plan→implement→review→verify→summarize→commit→repeat)

1. **Discover** — `lookup` profile (cheap model, LSP/ast_grep-first, citations). Output: spans
   and file:line facts, not opinions.
2. **Plan** — `architecture` profile (read-only, high thinking): shape + logged rejected
   alternatives (its ADR rule enforces this).
3. **Implement** — `implementation` profile: build against the settled plan; "not handed off
   until build/test reports clean" rule is the inner verify gate.
4. **Review** — `review` profile: severity-tiered findings, read-only, max 2 fix cycles then
   human escalation (built-in circuit breaker).
5. **Verify** — `npm run check` (typecheck + 139 tests) — the repo's single gate command.
6. **Summarize** — DECISIONS.md entry (the repo's established convention) + `.orch/summaries/`
   for multi-step effort.
7. **Commit** — small, logically scoped (repo history shows the convention: one concern per
   commit, numbered task prefixes).
8. **Repeat / feedback** — telemetry + `/profile misroute` accumulate evidence; periodic
   vocabulary-tuning pass consumes it (this is exactly the D-F2 gate procedure, generalized).

## Failure recovery & persistence

- **Failure recovery**: fail-open routing means a bad config never blocks the loop (warn-once,
  continue). Test failures halt at step 5 with output; review failures escalate after 2 cycles.
- **Human intervention points** (keep, don't automate away): model-switch confirm (cost
  consent), `premium` keyword triggers (schema/secrets/migrations), review escalation,
  D-F1/D-F2 gates (evidence-before-change).
- **Session persistence / resume**: the extension is stateless per prompt (config re-read,
  reclassify) so resume is inherently safe. Losses on restart: pins, model decisions, stats —
  QOL-7 (persist model decisions) removes the only one that costs the user repeated dialogs.
- **Checkpointing**: git is the checkpoint store; `.orch/READ-LEDGER.md` is the established
  don't-re-read cache for multi-agent efforts — keep using it.

## Handoff

```yaml
phase: workflow-design
status: complete
key_points:
  gate_command: npm run check
  circuit_breakers: [review 2-cycle cap, model confirm, premium triggers]
  missing_piece: telemetry read surface (QOL-6)
```
