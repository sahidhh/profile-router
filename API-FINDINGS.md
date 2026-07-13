# API-FINDINGS.md — Empirical verification against `@oh-my-pi/pi-coding-agent`

Verified by installing the real package and reading its shipped source/types —
not from memory, not from docs. All citations are `file:line` relative to
`node_modules/@oh-my-pi/pi-coding-agent/` after running:

```
npm install --save-dev @oh-my-pi/pi-coding-agent typescript @types/node
```

Installed version: **16.4.1** (resolved from the `latest` npm tag on 2026-07-10).
Package metadata: `package.json` — `"main": "./src/index.ts"`, `"types": "./dist/types/index.d.ts"`.
Strict typecheck in this repo compiles against `dist/types/index.d.ts` (the
published surface), so every finding below is cross-checked against **both**
`src/**/*.ts` (authoritative behavior) and `dist/types/**/*.d.ts` (what `tsc`
actually sees).

---

## (a) Import path, API type, module shape

**Finding: `ExtensionAPI`, not `HookAPI`.** The two are asymmetric:

- `HookAPI`'s `before_agent_start` result type
  (`src/extensibility/hooks/types.ts:426-429`) is
  `{ message?: CustomMessagePayload }` — **no system-prompt field at all.**
- `ExtensionAPI`'s `before_agent_start` result type
  (`src/extensibility/extensions/types.ts:912-916`) is
  `{ message?: CustomMessagePayload; systemPrompt?: string[] }`.

Since the mission requires injecting merged rules into the system prompt,
`HookAPI` cannot do the job — only `ExtensionAPI` exposes that capability.
This is also confirmed structurally: `extensions/types.ts:329-336` documents
extensions as having "a strictly larger runtime surface" than hooks
specifically citing "system prompt access" as one of the extension-only
capabilities.

**Import**: `import type { ExtensionAPI, ExtensionFactory } from "@oh-my-pi/pi-coding-agent";`
(package root export; confirmed via `dist/types/index.d.ts` re-exporting
`extensibility/extensions/types`).

**Module shape**: `src/extensibility/extensions/loader.ts:45-50`

```ts
type LoadedExtensionModule = ExtensionFactory | { default?: ExtensionFactory };
function getExtensionFactory(module): ExtensionFactory | null {
  const candidate = typeof module === "function" ? module : module.default;
  return typeof candidate === "function" ? candidate : null;
}
```

A default-exported (or bare-exported) function `(pi: ExtensionAPI) => void | Promise<void>`.
Matches the scaffold's `export default function (pi: ExtensionAPI) { ... }`.

**Discovery / install location** — corrected from the scaffold's header comment.
Confirmed in `src/discovery/builtin.ts:473` (`discoverExtensionModulePaths(ctx, path.join(dir, "extensions"))`)
combined with `getConfigDirs()` (`builtin.ts:57-70`) and
`node_modules/@oh-my-pi/pi-utils/src/dirs.ts:207-213,240-247`:

| Scope | Real path | Note |
|---|---|---|
| Project | `<cwd>/.omp/extensions/*.ts` | `.omp` dir must be non-empty to be scanned at all (`ifNonEmptyDir`, `builtin.ts:45-52`) — satisfied automatically once `bundles.json` also lives in `.omp/` |
| Global (default profile) | `~/.omp/agent/extensions/*.ts` | **not** `~/.omp/extensions/` as the scaffold's header claimed |
| Global (named profile `X`) | `~/.omp/profiles/X/agent/extensions/*.ts` | `getAgentDir()` is profile-scoped (`dirs.ts:493-495`, comment at `builtin.ts:64-65`) |

Also independently confirmed by the shipped example's own install comment
(`examples/extensions/pirate.ts:7-9`): *"Copy this file to `~/.omp/agent/extensions/`
(legacy: `~/.pi/agent/extensions/`) or your project's `.omp/extensions/`"*.

---

## (b) Event name + prompt field + systemPrompt override

**Event**: `before_agent_start`. **Prompt field**: `event.prompt: string`
(`extensions/types.ts:560-565`):

```ts
export interface BeforeAgentStartEvent {
  type: "before_agent_start";
  prompt: string;
  images?: ImageContent[];
  systemPrompt: string[];
}
```

No fallback field (`userMessage` etc.) exists or is needed — `prompt` is
always present and typed `string`, not optional.

**System prompt override**: return `{ systemPrompt: string[] }` from the
handler. Two important corrections vs. the scaffold:

1. **It's `string[]`, not `string`.** The scaffold's
   `event.systemPrompt + "\n\n..."` (string concatenation) does not typecheck
   against the real field, which is an array both on the incoming event and
   the outgoing result (`extensions/types.ts:564`, `:915`).
2. **"Chained" means replace-then-pass-on, not auto-append.** Verified in
   `src/extensibility/extensions/runner.ts:991-1034`: each extension receives
   `currentSystemPrompt` (whatever the previous extension in load order
   returned, or the original if none did) as `event.systemPrompt`, and if it
   returns `systemPrompt`, that value **replaces** `currentSystemPrompt` for
   the next extension in the chain — nothing is appended automatically. To
   append our rules block, the handler must return
   `[...event.systemPrompt, ourRulesBlock]` itself.

**Caveat — `pirate.ts` example is stale relative to the shipped types.**
`examples/extensions/pirate.ts:29-39` returns `{ systemPromptAppend: "..." }`.
That field does **not** exist in `BeforeAgentStartEventResult` in either
`src/extensibility/extensions/types.ts:912-916` or the compiled
`dist/types/extensibility/extensions/types.d.ts:606-609` — confirmed absent
in both the authoritative source and the published declaration file that
`tsc` actually checks against. Returning `{ systemPromptAppend }` from a
strictly-typed extension would fail excess-property checking. **We use the
typed `systemPrompt: string[]` field, not `systemPromptAppend`.**

---

## (c) Programmatic model switching

**A real API exists** — no fallback-to-`/model` needed. Two pieces:

1. `ctx.models.resolve(spec: string): Model | undefined` — resolves a
   `bundles.json` model string (bare id, `provider/id`, or a configured role
   alias like `pi/slow`) to a concrete `Model`, using the same
   settings-backed alias/match-preference logic as core `/model` selection.
   Source: `src/extensibility/extensions/model-api.ts:20-39`, typed on
   `ExtensionContext.models: ExtensionModelQuery` (`extensions/types.ts:342-360`, `:379-380`).
2. `pi.setModel(model: Model): Promise<boolean>` — declared on `ExtensionAPI`
   itself (`extensions/types.ts:1151-1152`), implemented by
   `ConcreteExtensionAPI.setModel` (`loader.ts:243-245`) which delegates to
   the session runtime. Returns `false` if no API key is available for that
   model (not a thrown error) — the extension must check the boolean.

Since `pi` (the factory argument) is captured by closure, it is callable from
inside any `pi.on(...)` handler, including `before_agent_start`. Flow used in
the implementation:

```ts
const resolved = ctx.models.resolve(next.model);
if (resolved) {
  const ok = await pi.setModel(resolved);
  if (!ok) ctx.ui.notify(`No credentials for ${next.model} — run /model ${next.model} manually`, "warning");
}
```

`Model` shape (for comparing "did the model actually change" and for
display): `id: string`, `provider: Provider`, `name: string`
(`node_modules/@oh-my-pi/pi-catalog/src/types.ts:683-704`). Current session
model is read via `ctx.model: Model | undefined` (`extensions/types.ts:378`)
or `ctx.models.current()`.

**Thinking level**: `pi.setThinkingLevel(level: ThinkingLevel, persist?: boolean): void`
(`extensions/types.ts:1157-1158`) — synchronous, no confirmation gate
required by the mission spec (only model switches require confirm+memoize).
`ThinkingLevel` is `"inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`
(`node_modules/@oh-my-pi/pi-agent-core/src/thinking.ts:8-19`). `bundles.json`
uses the 3-value subset (`low|medium|high`) per the mission's schema; the
wider set is accepted by the runtime but intentionally not exposed in our
schema to keep authoring simple.

**Active tools**: `pi.setActiveTools(toolNames: string[]): Promise<void>`
(`extensions/types.ts:1146`, delegating to `runtime.setActiveTools` in
`loader.ts:235-237`). Used to make the `tools` union field (hard constraint
#4: list fields union with dedup) have a real runtime effect — otherwise
`bundles.json` would declare per-profile tool lists that are merged but
never applied. Only called when the merged `tools` array is non-empty
(`next.tools.length > 0`); left untouched otherwise so a no-match prompt or
a profile that omits `tools` never silently strips `bash`/`edit`/`write`
via an accidental `setActiveTools([])`. This wiring is not explicitly
named in the mission's Phase 2 checklist (which only calls out rules
injection and model routing) but is needed to make the `tools` field the
mission's own Phase 1 schema requires do anything at runtime — recorded as
an autonomous decision in `DECISIONS.md`.

---

## (d) Subagent identification in `tool_call`

Subagents are invoked through the built-in **`task`** tool
(`src/task/index.ts:453`: `readonly name = "task"`). Its parameter schema
(`src/task/types.ts:233-235`) includes a top-level, optional, defaulted field:

```ts
export interface TaskParams {
  agent?: string;   // schema default: 'task' (src/task/types.ts:114,123,131,137)
  ...
}
```

Because `"task"` is not one of the named tool-event variants
(`bash`/`read`/`edit`/`write`/`grep`/`glob`), it flows through
`CustomToolCallEvent { toolName: string; input: Record<string, unknown> }`
in the `ToolCallEvent` union (`extensions/types.ts:739-752`). So in the
`tool_call` handler:

```ts
if (event.toolName === "task") {
  const target = String(event.input?.agent ?? "task"); // "task" is the schema default when omitted
  if (active.disabledAgents.includes(target)) return { block: true, reason: `...` };
}
```

`ToolCallEventResult` (`src/extensibility/shared-events.ts:286-291`):
`{ block?: boolean; reason?: string }` — matches the scaffold exactly.

---

## (e) `registerCommand`, `ctx.ui.confirm`, `ctx.ui.notify`, `ctx.ui.setStatus`

All four match the scaffold's usage as written; confirmed against
`src/extensibility/extensions/types.ts`:

- `registerCommand(name: string, { description?, getArgumentCompletions?, handler(args, ctx: ExtensionCommandContext) => Promise<void> }): void` (:1066-1074)
- `ctx.ui.confirm(title: string, message: string, dialogOptions?: ExtensionUIDialogOptions): Promise<boolean>` (:193)
- `ctx.ui.notify(message: string, type?: "info" | "warning" | "error"): void` (:199)
- `ctx.ui.setStatus(key: string, text: string | undefined): void` (:205)

`pi.logger` is `typeof PiLogger` (winston-backed) exposing
`debug(message, context?)` / `info` / `warn` / `error`
(`node_modules/@oh-my-pi/pi-utils/src/logger.ts:145-186`). Used for debug
logging gated on `PROFILE_ROUTER_DEBUG=1`.

---

---

## Deep runtime verification (beyond static typecheck)

`dist/cli.js` (the packaged `omp` binary) fails to parse under both `node
--experimental-strip-types` and `bun` in this environment (`SyntaxError:
Unexpected identifier 'K'` at `cli.js:139` — a pre-existing issue in the
published bundle, not something introduced here), so a full interactive
`omp` session could not be started to smoke-test the extension. Provider
credentials are also unavailable in this sandbox. Per the mission's
fallback instruction, the extension was instead verified by loading it
through the **real, non-public loader internals** the installed package
ships in `src/` (`loadExtensionFromFactory` +
`ConcreteExtensionAPI`/`ExtensionRuntime` from
`src/extensibility/extensions/loader.ts`), run under `bun` (the runtime
OMP's own loader targets):

1. `loadExtensionFromFactory(profileRouterExtension, cwd, eventBus, runtime, "profile-router")`
   — loads `profile-router.ts`'s default export through the *actual*
   `ConcreteExtensionAPI` class, not a hand-rolled stub. Confirmed it
   registers exactly `before_agent_start` + `tool_call` handlers and a
   `profile` command, with no load-time exceptions.
2. Firing a real `before_agent_start` event (`prompt: "please find where the
   auth middleware is defined and explain how it works"`, `.omp/bundles.json`
   copied into a scratch `cwd`) through the loaded handler confirmed, in one
   pass: the `lookup` profile is classified correctly; the returned
   `systemPrompt` array has exactly one appended block containing the
   `lookup` profile's rules; the status line reads `⚙ lookup`;
   `ctx.ui.confirm` fires once for the haiku model suggestion;
   `pi.setModel` is called with the resolved `Model` object; `pi.setActiveTools`
   is called with `["read","grep","glob"]`; `pi.setThinkingLevel` is called
   with `"low"`.
3. Firing a `tool_call` event for `{ toolName: "task", input: { agent: "task" } }`
   confirmed it is blocked (`{ block: true, reason: 'Agent "task" disabled by
   profile lookup' }`), since `lookup` sets `disabledAgents: ["task"]`.
4. Invoking the registered `/profile` command handler confirmed both the
   status-report path (`"Active: lookup(2)\nModel: ... | Thinking: low |
   Disabled agents: task"`) and the invalid-name path
   (`ctx.ui.notify(..., "error")` listing known profile names, no throw).

This exercises the exact `ExtensionAPI` implementation OMP's own session
runtime constructs at load time (`ConcreteExtensionAPI` in `loader.ts`) —
the only untested seam is the session/agent-loop plumbing around it (turn
scheduling, provider calls), which requires a live model credential and is
out of scope for a static extension. The scratch script used for this is
not committed (it deep-imports package-internal paths not part of the
public API surface and would be fragile as a permanent test); the
committed `test/profile-router.test.ts` instead exercises `classify()` /
`merge()` / `loadBundles()` directly (pure functions, stable regardless of
SDK internals) plus a public-API-shaped stub for the extension-load smoke
test.

---

## Corrections applied to `profile-router.ts` as a result

1. Kept `ExtensionAPI` (scaffold's guess was already right; hooks are ruled
   out per (a)/(b) above — this is now load-bearing, not incidental).
2. `event.prompt` used directly — no `?? event.userMessage` fallback (field
   is required, not optional).
3. System prompt injection rewritten to operate on `string[]` and
   explicitly append (`[...event.systemPrompt, block]`) rather than
   string-concatenate.
4. Model switch rewritten to use `ctx.models.resolve()` + `pi.setModel()`
   with a real boolean success check, replacing the `ctx.model?.set?.()`
   speculative call and try/catch fallback.
5. `disabledAgents` enforcement narrowed to `event.toolName === "task"` with
   `event.input?.agent ?? "task"` (was `bash`-shaped guesswork with an
   `agent ?? subagent` double fallback).
6. Header install-path comment corrected to `~/.omp/agent/extensions/`
   (project: `.omp/extensions/`), matching the shipped example's own doc
   comment and the discovery source.

---

## (f) `session.compacting` — mid-run compaction rule re-injection (2026-07-13)

**Finding: the event name really does use a dot (`session.compacting`), not
an underscore**, unlike every other event name used elsewhere in this
extension (`before_agent_start`, `tool_call`). Confirmed at the registration
signature itself, `dist/types/extensibility/extensions/types.d.ts:652`:

```ts
on(event: "session.compacting", handler: ExtensionHandler<SessionCompactingEvent, SessionCompactingResult>): void;
```

This is a real, distinct string literal type on the `on()` overload set, not
a typo carried over from a different naming convention — `pi.on("session.compacting", ...)`
is the only spelling that type-checks against this overload.

**Event payload** (`SessionCompactingEvent`), `dist/types/extensibility/shared-events.d.ts:66-70`
(source: `src/extensibility/shared-events.ts:77-81`):

```ts
export interface SessionCompactingEvent {
  type: "session.compacting";
  sessionId: string;
  messages: AgentMessage[];
}
```

**Handler return type** (`SessionCompactingResult`), `dist/types/extensibility/shared-events.d.ts:276-284`
(source: `src/extensibility/shared-events.ts:342-350`):

```ts
/** Return type for `session.compacting` handlers */
export interface SessionCompactingResult {
  /** Additional context lines to include in summary */
  context?: string[];
  /** Override the default compaction prompt */
  prompt?: string;
  /** Custom data to store in compaction entry */
  preserveData?: Record<string, unknown>;
}
```

**Why `context`, not `prompt` or `preserveData`.** All three fields are
optional and independent, but they do different jobs:

- `prompt` overrides the *compaction prompt itself* — i.e. the instructions
  given to whatever process summarizes the conversation. Using it to carry
  our rules would mean replacing (or having to carefully splice into) the
  compaction instructions, which is a much larger blast radius than intended
  and risks breaking the summarizer's own behavior.
- `preserveData` stores custom data *in the compaction entry* — structured
  data for the extension's own later retrieval, not something documented as
  flowing into the summary text the model sees afterward.
- `context` is documented as "Additional context lines to include in
  summary" — exactly the shape needed: extra lines injected alongside
  whatever the compaction step already preserves, so they survive into the
  post-compaction context. This mirrors the existing `before_agent_start` →
  `systemPrompt` append pattern (finding (b) above) without touching the
  compaction mechanism itself.

**Handler signature note.** `ExtensionHandler<E, R>` is
`(event: E, ctx: ExtensionContext) => Promise<R | void> | R | void`
(`dist/types/extensibility/extensions/types.d.ts:630`). Unlike the
`before_agent_start` handler, this handler needs no I/O from `ctx` (no
`ctx.cwd`, `ctx.ui`, etc.) — it only reads the closure-scoped `active`
(`MergedConfig | null`) already populated by `before_agent_start` on the
most recent prompt, so both parameters are prefixed `_event`/`_ctx` and
unused.
