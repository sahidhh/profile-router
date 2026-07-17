# 01 — Project Overview

## Executive Summary

`profile-router` is a single-file TypeScript extension (884 lines, Node built-ins only) for the
OMP coding agent (`@oh-my-pi/pi-coding-agent` v16.4.1, pinned exact). It classifies **every user
prompt** with zero LLM calls — word-boundary keyword scoring against a JSON profile table
(`bundles.json`) — and per matched profile: injects engineering rules into the system prompt,
routes the model (with confirm dialog) and thinking level, restricts the active toolset, and
blocks disabled subagents. The economic thesis: cheap deterministic routing sends cheap prompts
to cheap models (Gemini Flash-Lite, DeepSeek) and reserves expensive models (Sonnet, Opus) for
work that warrants them.

## Purpose and target users

- **Purpose**: per-prompt cost/behavior routing for an agentic coding CLI. The keyword table
  *is* the API — users steer routing by phrasing prompts with trigger vocabulary.
- **Users**: individual OMP users (project-local `.omp/` install) or all sessions (global
  `~/.omp/agent/` install). Authoring audience: anyone who can edit JSON and run `npm test`.

## Tech stack & execution model

| Aspect | Choice |
|---|---|
| Language | TypeScript (strict, `noUncheckedIndexedAccess`), ES2022, ESM |
| Runtime deps | **None** — Node built-ins (`fs`, `path`, `os`, `crypto`) only |
| Dev deps | `typescript`, `@types/node`, `@oh-my-pi/pi-coding-agent` (types + catalog verification) |
| Build | None — `noEmit` typecheck; OMP loads the `.ts` directly; tests via `node --experimental-strip-types` |
| Test | `node:test`, 139 tests / 28 suites, all green |
| CI | GitHub Actions: `npm install && npm run check` on Node 22 |

## Important modules (all in `profile-router.ts`)

- **Pure core** (exported, unit-tested): `loadBundles`, `scoreProfile`, `classify`, `explain`,
  `merge`, `validateBundles`.
- **Extension shell** (default export factory): session state in closure; hooks
  `before_agent_start` (the routing entrypoint), `session.compacting` (summary-bias context,
  documented as believed-redundant), `tool_call` (blocks disabled `task` agents); `/profile`
  command with 9 subcommands.

## Major workflows

1. **Per-prompt routing**: load config → hash-compare (change notice) → classify → apply manual
   override → merge → set status line → telemetry log → model confirm → thinking level →
   `setActiveTools` → return rules injection block.
2. **Authoring**: edit `bundles.json` (JSON Schema editor validation) → `/profile validate` or
   `npm test` (reachability suite catches keyword collisions) → hot-applied next prompt.
3. **Misroute feedback**: `/profile misroute [expected]` → `.omp/misroutes.jsonl` corpus;
   automatic telemetry → `.profile-router-telemetry.log`.

## Key design decisions (from DECISIONS.md, verified in code)

- **Zero-LLM classifier** — routing must cost nothing.
- **JSON-only authoring** — git-diffable, testable; no add/edit commands by design.
- **Merge semantics**: rules/skills/tools **union** (dedup), `disabledAgents` **intersection**
  (safety-conservative), model/thinking to highest-scoring match; tagged-rule suppression
  (`suppresses`) resolves read-only vs. write co-match contradictions.
- **Model changes confirm; thinking level silent** — only cost switches gate on the user.
- **Fail-open** on config/model errors: warn once, continue on current model, never crash.
- **Two active gates** (must be respected by any future work): D-F1 (skills filtering needs a
  one-time `.js` verification first) and D-F2 (lookup+investigation co-match fix waits on ~1
  week of telemetry).

## Handoff

```yaml
phase: project-overview
status: complete
facts:
  main_source: profile-router.ts (884 lines)
  config: bundles.json (7 profiles + default)
  tests: test/profile-router.test.ts (139 pass)
  runtime_deps: none
  upstream_pin: "@oh-my-pi/pi-coding-agent@16.4.1 (exact, deliberate)"
  active_gates: [D-F1 skills-filter verification, D-F2 telemetry-before-cofix]
next_phase_inputs:
  routing_entrypoint: profile-router.ts:450 (before_agent_start)
  pure_core: profile-router.ts:76-388
  command_handler: profile-router.ts:692
```
