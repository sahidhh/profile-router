# VERIFICATION-REPORT.md — Adversarial audit of `profile-router`

Independent re-verification of a previously "completed" build. Nothing in
`DECISIONS.md`, `API-FINDINGS.md`, or prior test logs was trusted; every claim
below was re-derived from scratch against real installed source, real
`bundles.json`, and real code execution in this session.

---

## 1. Findings table

| ID | Severity | What | Evidence | Fixed? |
|----|----------|------|----------|--------|
| F1 | MED | `ctx.ui.confirm` model-switch dialog named only `matched[0]`, silently dropping co-matched profiles (e.g. a security-flavored `premium` match riding along with `lookup`) from the text a user approves/declines against — inconsistent with the status line, which does join all matched names. | `profile-router.ts:199` (pre-fix); reproduced via a fake-`ctx` harness invoking the real `before_agent_start` handler with a 2-profile tie (`lookup`+`premium` on "what is the token used for..."): confirm text said `Profile "lookup" suggests...` while status line said `⚙ lookup+premium`. | **Fixed** — dialog text now uses `next.matched.map(m=>m.name).join("+")`, same expression the status line already used. Diff: 1 line. Typecheck + all 31 tests still pass. |
| F2 | MED | Stale `/profile <name>` override: if the pinned name is later removed/renamed in `bundles.json`, `before_agent_start` silently falls through to auto-classification on the next prompt (the `if (p)` guard at `profile-router.ts:171-173` no-ops when the name isn't found) — but `manualOverride` is never cleared and never triggers a notification, so the status line still appends `(manual)` to whatever *auto-classified* profile happens to match, misrepresenting it as pinned. | Reproduced live: pinned `/profile implementation` while it existed, then rewrote `bundles.json` to drop that name and add profile `other` with an overlapping keyword; next prompt produced status `⚙ other (manual)` — `other` was never pinned, it auto-matched, yet the UI claims it's a manual override. | Proposed only, not applied (MED, and the correct behavior — clear-and-notify vs. reject-and-keep-trying — is a product decision, not a pure bug fix). |
| F3 | MED | A profile whose `model` string doesn't resolve (typo, unconfigured provider) degrades **completely silently** in normal operation — no `ctx.ui.notify` call anywhere on the `!resolved` branch, only a `pi.logger.debug` line gated behind `PROFILE_ROUTER_DEBUG=1` (a variable most users won't set). This falls short of the audit's stated failure-mode bar ("degrade with a single notification") even though it does satisfy "never crash." | Reproduced via harness: `bundles.json` profile with `model: "anthropic/does-not-exist-model"`; `ctx.models.resolve` returns `undefined`; handler returns normally, zero entries in the fake `notifications` array, only a debug-log entry appears (and only when the env var is pre-set before module load, matching `const DEBUG = process.env...` being read once at import time). | Proposed only: add a single `ctx.ui.notify(..., "warning")` on the `!resolved` branch, deduped the same way `warnedPaths` dedupes config-parse warnings (would need a small per-model-string `Set`, so it's not a zero-line change — left as a proposal rather than applied). |
| F4 | LOW | Intra-profile keyword self-overlap: the `review` profile lists both bare `"review"` and the phrases `"code review"` / `"pull request review"`. Because `"review"` is a separate whitespace-delimited word inside those phrases, `\breview\b` matches independently of `\bcode review\b`, so any prompt containing either phrase scores `review` **2 points**, not 1 — silently weighting `review` above other single-keyword matches in ties. (Checked for the analogous risk on `architecture`'s `"design"`/`"redesign"` and `implementation`'s `"implement"`/`"write the implementation"` — those do **not** double-count, because the short keyword is directly adjacent to more letters with no word boundary in between, e.g. `\bdesign\b` cannot match inside `redesign`.) | `node --experimental-strip-types` repro: `classify("pull request review needed", bundles)` → `review:2`. Confirmed via the same run that `"please redesign this module"` → `architecture:1` (no double count) and `"write the implementation for this endpoint"` → `implementation:1` (no double count) — isolating the bug to the `review` profile specifically. | Proposed only: either drop bare `"review"` from `review`'s keyword list (the two longer phrases already cover the profile's real trigger vocabulary) or accept it as intentional extra confidence weighting — needs an authoring decision, not a mechanical fix. |
| F5 | MED (design risk, not a bug) | `lookup` is declared first in `bundles.json` and its keyword list is built from generic, extremely common English words (`find`, `search`, `explain`, `show me`, `what is`, `how does`). In **every one of 4 adversarial multi-intent probes** that tied `lookup`'s score against `premium`, `investigation`, or `implementation`, the tie-break (declaration order) picked `lookup` — routing a security-adjacent or debugging-flavored prompt to the cheap Haiku/low-thinking profile. This is not a mismatch against the documented contract (tie-break-by-declaration-order is explicit, tested, and `MANUAL.md` says "fixed, do not redesign"), but it is a systematic emergent risk from the combination of keyword choice + declaration order, worth flagging for anyone reordering or extending `bundles.json`. | See probes #2–#5, #8 in §2 below — all 4 ties resolved to `lookup`, all with 100% reproducibility. `rules`/`tools`/`skills` still union correctly (so the merged toolset is *not* wrongly restricted — e.g. `lookup`+`premium` ties still union in `edit`/`write`/`bash` from `premium`), the actual exposure is limited to `model`/`thinkingLevel` picking the weaker tier, and the (now-fixed, F1) confirm dialog gives the user a chance to catch it. | Not fixed — changing the tie-break algorithm or reordering `bundles.json` would be a redesign of documented, tested merge semantics, out of this audit's scope. Documented here as a residual risk instead (see §3). |

No HIGH findings survived: **every OMP API call in `profile-router.ts` traced exactly to real installed source** (see §2a), and **no input (malformed/missing/empty config, empty prompt, 10k-char prompt, unresolvable model) crashed the session** in any probe.

---

## 2. Verification detail

### (a) Re-run from scratch
- `node_modules` was **not present** at the start of this session (a red flag on its own — nothing had actually been re-verified against real source since the branch's own `npm install`). Ran `npm install` fresh; installed `@oh-my-pi/pi-coding-agent@16.4.1`, matching the version `API-FINDINGS.md` claims.
- `npm run typecheck` (`tsc -p tsconfig.json`, strict mode): **clean, zero errors.**
- `npm test` (`node --experimental-strip-types --test test/*.test.ts`): **31/31 pass**, 0 fail, 0 skipped.

### (b) API claims re-verified against real source (not memory, not docs)
Checked every citation in `API-FINDINGS.md` directly against `node_modules/@oh-my-pi/pi-coding-agent/{src,dist/types}`:

| Claim | Verified against | Result |
|---|---|---|
| `HookAPI.BeforeAgentStartEventResult` has no `systemPrompt` field | `src/extensibility/hooks/types.ts:425-429` | Matches exactly |
| `ExtensionAPI.BeforeAgentStartEventResult` has `{ message?, systemPrompt? }` | `src/extensibility/extensions/types.ts:912-916` | Matches exactly |
| `BeforeAgentStartEvent.prompt: string` (required, not optional) | `src/extensibility/extensions/types.ts:560-565` | Matches exactly |
| Extension module shape = bare fn or `{ default: fn }` | `src/extensibility/extensions/loader.ts:45-50` | Matches exactly |
| System-prompt chaining is replace-then-pass-on, not auto-append | `src/extensibility/extensions/runner.ts:988-1030` (`emitBeforeAgentStart`) | Matches exactly — traced the actual loop, confirmed `currentSystemPrompt` is reassigned only when a handler returns `systemPrompt`, and passed to the next extension in the chain |
| `ctx.models.resolve()` / `pi.setModel()` real, typed, boolean-returning | `src/extensibility/extensions/model-api.ts:1-39`, `src/extensibility/extensions/types.ts:1140-1158`, `loader.ts:235-252` | Matches exactly |
| `pi.setThinkingLevel`, `pi.setActiveTools` real | `src/extensibility/extensions/types.ts:1145-1158`, `loader.ts:235-252` | Matches exactly |
| `ThinkingLevel` = `inherit\|off\|minimal\|low\|medium\|high\|xhigh\|max` | `node_modules/@oh-my-pi/pi-agent-core/src/thinking.ts` + `@oh-my-pi/pi-catalog/src/effort.ts` | Matches exactly |
| Subagents invoked only via built-in `task` tool, `agent` param defaults to `"task"` | `src/task/index.ts:453`, `src/task/types.ts:83-141` (including batch-mode schemas) | Matches exactly. Also checked the batch-call schema (`taskSchemaBatch`) specifically for a per-item `agent` override that could evade the `tool_call` block check — **none exists**; `agent` is only ever a single top-level field, batch or not, so `event.input?.agent ?? "task"` is a complete check, not a partial one, as `DECISIONS.md #13` claims |
| `registerCommand`, `ctx.ui.confirm/notify/setStatus` signatures | `src/extensibility/extensions/types.ts:1066-1074, 185-210` | Matches exactly |
| Discovery paths: `.omp/extensions`, `~/.omp/agent/extensions`, `~/.omp/profiles/<X>/agent/extensions` | `src/discovery/builtin.ts` (`getConfigDirs`, `PATHS = SOURCE_PATHS.native`), `src/discovery/helpers.ts` (`SOURCE_PATHS.native`), `pi-utils/src/dirs.ts` (`CONFIG_DIR_NAME = ".omp"`, `getProfileConfigRoot`, `getProfileAgentDir`) | Matches exactly, traced the full chain rather than trusting the citation |
| `ExtensionAPI` importable from package root | `dist/types/index.d.ts:15-16` (`export type/* * from "./extensibility/extensions/index.js"`) → `dist/types/extensibility/extensions/index.d.ts` → `types.ts:977` | Matches exactly |
| `dist/cli.js` fails to parse under both `node --experimental-strip-types` and `bun` | Ran both directly | **Reproduced identically** — `SyntaxError: Unexpected identifier 'K'` at `cli.js:139` under Node; same byte offset, same error class under Bun. Confirms this is a real, pre-existing vendor packaging defect, not a fabricated excuse for skipping live testing. |

**Zero API claims failed verification.** This is an unusually clean result for an adversarial audit — every citation was checked, not spot-sampled.

### (c) Adversarial classifier probes (10 new prompts, predicted before running)

All predictions were written down before invoking `classify()`. All 10 matched actual behavior exactly (full script + predictions preserved in scratchpad, results below):

| # | Prompt | Predicted | Actual | Note |
|---|---|---|---|---|
| 1 | "review this then fix it" | `review` only | `review:1` | ✅ bare "fix" correctly not a keyword anywhere |
| 2 | "what is the token used for in this auth flow" | `lookup`+`premium` tie, lookup wins | `lookup:1, premium:1` → Haiku/low | ✅ confirms F5 |
| 3 | "investigate why the search feature returns duplicate results and then implement a fix" | 3-way tie, lookup wins | `lookup:1, implementation:1, investigation:1` → Haiku/low | ✅ confirms F5 |
| 4 | "explain why this search algorithm has a bug and trace the root cause" | `lookup`/`investigation` tie at 2, lookup wins | `lookup:2, investigation:2` → Haiku/low | ✅ confirms F5 |
| 5 | "look up the credential rotation policy in the docs" | `lookup`/`premium` tie, lookup wins | `lookup:1, premium:1` → Haiku/low | ✅ plausible-correct (doc read, not a secret touch) |
| 6 | "please reset the discussion and start over with a fresh approach" | no match | `(none)` → default | ✅ confirms "reset --hard" phrase keyword doesn't false-positive on bare "reset" |
| 7 | "the password reset flow needs a code review before we merge this PR" | `review`/`premium` tie at 1, review wins | `review:2, premium:1` → **outright** review win (not a tie) | ⚠️ predicted score wrong (see F4) — mechanism differs (self-overlap, not tiebreak) but outcome direction was right |
| 8 | "can you show me how the payment token validation logic works, and if there's a bug fix it" | `lookup`/`premium` tie, lookup wins | `lookup:1, premium:1` → Haiku/low | ✅ confirms F5 |
| 9 | "urgent: this quick fix needs a schema migration too, ship it now" | `premium` outright wins (2>1) | `premium:2, hotfix:1` → Opus/high | ✅ **validates the intended safety guardrail**: schema/migration content overrides hotfix's time-pressure framing, exactly as `hotfix`'s own rule text demands ("Never use this profile for schema, secrets, or invariants regardless of time pressure") |
| 10 | "asdkjhasdkjh flibbertigibbet zzzqx unrelated nonsense" | no match | `(none)` → default | ✅ |

**Keyword collision matrix**: programmatically diffed every profile pair's keyword list for exact-string duplicates — **zero found** (each profile's literal keyword strings are unique across the whole table). The real collision surface is semantic co-occurrence in natural prompts, which is what probes #2–#5, #7, #8 exercise directly; see F4/F5 for the two distinct mechanisms found (in-profile self-overlap vs. cross-profile tie-break bias).

### (d) Failure-mode probes
All run against the real `loadBundles`/`classify`/`merge`/`before_agent_start` handler (via a fake-`ExtensionAPI` harness matching the shape the committed test suite already uses):

| Scenario | Result |
|---|---|
| Malformed `bundles.json` (broken JSON) | No crash; `{ profiles: [] }`; exactly one warning notification |
| Missing `bundles.json` entirely | No crash; `{ profiles: [] }`; **no** notification (by design — not an error state) |
| Empty `profiles: []` | No crash; behaves identically to "no match" / default fallback |
| Profile referencing nonexistent model | No crash; status line still updates; **no user-facing notification** (F3) |
| Empty prompt `""` | No crash; `classify("")` → `[]` → default fallback |
| 10,000-char prompt (both keyword-dense and keyword-free) | No crash; sub-millisecond; score correctly caps at 1 per keyword regardless of repetition (no DoS/inflation vector); keyword-free 10k string correctly falls to default |

### (e) Manual accuracy check
Followed `MANUAL.md` §1 literally in a fresh temp directory (project-scope path): copied `profile-router.ts` → `.omp/extensions/`, `bundles.json` → `.omp/bundles.json`, confirmed `.omp/` is non-empty as claimed. Verified the global (`~/.omp/agent/extensions/`) and named-profile (`~/.omp/profiles/<X>/agent/extensions/`) paths directly against `pi-utils/src/dirs.ts`'s `getProfileConfigRoot`/`getProfileAgentDir` — both match `MANUAL.md` exactly. Ran the exact `node --experimental-strip-types -e '...'` sanity-check one-liner from §5 step 3 verbatim — works as written. `MANUAL.md`'s schema table (§2) and merge-semantics description were diffed line-by-line against `Profile`/`Bundles`/`merge()` in `profile-router.ts` — every field name and the resolution order (project → global, union/intersection/highest-score/tie-break) match the actual implementation exactly. Steps requiring a live interactive OMP session (restart, status-line visual check) could not be executed — `dist/cli.js` does not run in this environment (independently reproduced, see §2a) — this matches `MANUAL.md`'s own documented limitation rather than being an undisclosed gap.

### (f) Config sanity
All 7 profiles: rules are single-sentence imperatives (4-6 per profile, none over ~25 words — no spec-prose dumps). Both Haiku-tier profiles (`lookup`, `hotfix`) genuinely have `disabledAgents: ["task"]` and a restricted (non-full) tool list. Reachability prompts all pass the committed test suite; qualitatively, `architecture`, `implementation`, and especially `hotfix`'s fixture prompts ("we need a quick fix hotfix for this UI bugfix under time pressure") read as keyword-stuffed rather than naturally phrased — functionally fine as reachability proof, but weaker evidence of real-world phrasing robustness than the more natural `lookup`/`investigation` fixtures.

---

## 3. Confidence verdict: **SHIP-WITH-CAVEATS**

The implementation is unusually solid on the axis this audit weighted most heavily: every single OMP API call traces exactly to real, currently-installed source — including subtle claims (batch-mode `task` schema having no per-item agent override, the exact chaining semantics of `before_agent_start`, the precise discovery-path construction) that would have been easy to get wrong or leave unverified. Nothing crashed under any malformed/missing/empty/oversized input. The one HIGH-caliber risk (F1) has been fixed with a one-line, test-passing diff. What remains is a set of MEDIUM/LOW findings that are real but not blocking: a cosmetic-but-real staleness bug in the manual-override UI (F2), a silent-degradation gap for one specific misconfiguration (F3), a self-inflating keyword score in one profile (F4), and a systemic-but-documented tie-break bias toward the cheap `lookup` profile (F5) that is a property of the authored keyword choices, not a code defect — fixing it would mean redesigning tie-break semantics that `MANUAL.md` explicitly marks "fixed, do not redesign," so it's flagged as a residual risk instead of patched.

## 4. Residual risks — only real interactive usage will surface these

1. **F5 in practice**: watch for real prompts where a security/schema/credential-flavored request also happens to contain a `lookup` keyword (very likely, since "find", "explain", "show me" are common in natural phrasing) — confirm the status line (`⚙ lookup+premium`-style) and the (now-fixed) confirm dialog are actually being read by the user before they approve a model downgrade, not just reflexively clicked through.
2. **F2 in practice**: if you ever hot-edit `bundles.json` mid-session while a `/profile <name>` pin is active and rename/remove that profile, watch for the status line showing `(manual)` next to a profile you never pinned — that's the stale-override bug, not a new feature.
3. **Model-routing confirm fatigue**: `modelDecisions` memoizes by exact `(from→to)` pair for the life of the process — if a user declines once, they won't be asked again for that same pair even across many unrelated prompts later in a long session; worth watching whether that produces a "why didn't it ask me this time" surprise in a long real session.
4. **Skills field is inert**: `skills` in `bundles.json` is rendered as an LLM-visible hint block only — nothing forces the model to actually invoke a named skill. If a user expects `skills: ["adr-writer"]` to guarantee that skill fires, real usage will surface that expectation gap.
5. **No live OMP session was ever exercised end-to-end** in this environment (`dist/cli.js` doesn't parse here) — the deepest verification available was loading the extension through the real, non-exported `ConcreteExtensionAPI`/`loadExtensionFromFactory` internals. The actual TUI status-line rendering, actual `/reload` behavior, and actual provider-credential-gated `pi.setModel` failure path have only been verified structurally, never visually/interactively.
