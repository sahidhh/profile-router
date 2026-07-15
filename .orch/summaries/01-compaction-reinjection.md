# T1: compaction re-injection — verification summary

## Status: already implemented (pre-existing on this branch, not new work this pass)

Investigation found this task was already completed in an earlier session (Phase 10 /
"T3" in DECISIONS.md, dated 2026-07-13) and remains in the codebase, tested and
documented. This pass verified the hook signature against the installed package,
confirmed the implementation matches the verified API, and confirmed the test suite
still passes. No code was changed.

## Hook signature found

Installed version: `@oh-my-pi/pi-coding-agent@16.4.1` (matches `package.json`
devDependency and `node_modules` installed package.json exactly — no version drift).

The event is **not** named `session.compacting` as a guess/typo-of-underscore-style —
it genuinely uses a dot, verified directly in source (not just `.d.ts`):

- Registration: `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/hooks/types.ts:493`
  ```ts
  on(event: "session.compacting", handler: HookHandler<SessionCompactingEvent, SessionCompactingResult>): void;
  ```
- Event payload: `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/shared-events.ts:77-81`
  ```ts
  export interface SessionCompactingEvent {
    type: "session.compacting";
    sessionId: string;
    messages: AgentMessage[];
  }
  ```
- Handler return type: `node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/shared-events.ts:343-349`
  ```ts
  export interface SessionCompactingResult {
    context?: string[];        // additional context lines included in the summary
    prompt?: string;           // overrides the compaction prompt itself
    preserveData?: Record<string, unknown>;
  }
  ```
- Fires **before** compaction summarization (to influence the prompt/context that
  produces the summary) — not after. The after-compaction event is `session_compact`
  (underscore), which has no result type (can't inject content back).

This matches (and this pass independently re-confirmed) the finding already recorded
in `API-FINDINGS.md` section (f), lines 299-370.

## Injection point

`profile-router.ts:554-562` — inside `export default function (pi: ExtensionAPI)`:

```ts
pi.on("session.compacting", async (_event, _ctx) => {
  if (!active || active.rules.length === 0) return;
  return {
    context: [
      `## Active Engineering Rules (${active.matched.map((m) => m.name).join("+") || "default"})\n` +
        active.rules.map((r) => `- ${r}`).join("\n"),
    ],
  };
});
```

`active: MergedConfig | null` is the same closure-scoped state that
`before_agent_start` (lines 405-546) already populates on every classified prompt —
no new state was introduced. `context` was chosen over `prompt`/`preserveData` because
it's documented as "additional context lines to include in summary" — additive and
non-invasive, mirroring the existing `before_agent_start` → `systemPrompt` append
pattern used elsewhere in this file, without touching the compaction mechanism itself
(rationale fully recorded in `DECISIONS.md` decision #32, lines 434-446).

## Test added

Already present at `test/profile-router.test.ts:1093-1146`,
`describe("session.compacting: mid-run rule re-injection")`, 3 tests:

1. `"compact with active rules -> rules present in handler result"` — classifies a
   prompt against a profile with rules, invokes the `session.compacting` handler
   directly, asserts `result.context` exists and contains both rule strings and the
   matched profile name.
2. `"compact with active=null -> no-op"` — invokes the handler before any
   `before_agent_start` call (so `active` is still `null`), asserts the handler
   returns `undefined`.
3. `"compact with matched profile but zero rules -> no-op"` — classifies a profile
   with an empty `rules` array, asserts the handler returns `undefined`.

Ran `npm run check` (typecheck + `node --experimental-strip-types --test test/*.test.ts`):
**113/113 tests pass, 0 failures**, including all 3 `session.compacting` tests.

## Important caveat — flag for orchestrator, not acted on

A **later** pass on this same branch (dated 2026-07-15, i.e. today, in both
`API-FINDINGS.md:299-309` and `DECISIONS.md:424-432`) added a "SUPERSEDED /
FALSIFIED" note on top of this exact feature:

> The premise that mid-run compaction can drop the rules block is wrong — the merged
> rules ride in `systemPrompt`, a field separate from the message array, re-sent on
> every model call and never touched by compaction (`"system"` is not a message
> role). The `session.compacting` handler is therefore believed redundant. It was
> kept in place (harmless no-op when `active` is `null`) but **struck from the
> open-work list — explicitly marked "do not re-prioritize."**

I did not remove or alter the handler: the falsification note itself says to leave it
in place pending an explicit decision to remove it, and this task's instructions were
to verify + implement (already done), not to re-litigate a prior architectural call.
Flagging this so the orchestrator is aware the feature exists, is tested, but has an
open question mark over whether it does anything (the `context` field may never
receive real compaction traffic if `systemPrompt` truly can't be evicted — that
`systemPrompt`-is-never-compacted claim was not independently re-verified in this
pass; it would require tracing the agent-loop's system-prompt handling in
`@oh-my-pi/pi-agent-core`, which was out of scope here).

## Commit status

No commit was made. No files were modified this pass (verification only) other than
this summary and the append-only `.orch/READ-LEDGER.md`.
