# Cost & UX fix checklist

Findings from a user-perspective review on 2026-07-21 (productivity + cost
effectiveness). Ordered by cost impact. Each item is independently shippable.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` dropped

## Status as of 2026-07-21

| # | Item | Status |
|---|---|---|
| 1 | `premium` over-matches → Opus | done |
| 2 | Chain doesn't fall through (config **and** credential bug) | done |
| 2b | README/MANUAL document OpenRouter primaries that don't exist | done |
| 3 | Declined switch remembered forever | done |
| 4 | Telemetry can't show spend | done |
| 5 | Stickiness inherits read-only profile into action prompt | done |
| 6 | Vocabulary gaps | partial — mining blocked, no telemetry data yet |

Test suite went 155 → 174; all pass, typecheck clean. Nothing is committed —
review `git diff` before merging. Two things deserve a second opinion:

- **Item 5 inverted an existing test** that deliberately asserted the old
  behavior. Rationale is recorded under that item.
- **Item 3 lets a strict downgrade override a remembered decline.** That is the
  intended fix, but it does mean an old "no" stops being honoured for
  cheaper-on-both-axes switches.

If the extension is installed globally, re-run `npm run install:global` — items
2–5 changed `profile-router.ts`, and items 1/2/6 changed `bundles.json`.

---

## [x] 1. `premium` over-matches and bills common lookups at Opus

**Severity:** high (direct spend)

`premium` (`bundles.json`) triggers on bare single words — `schema`, `token`,
`migration`, `secret`, `password` — with no `excludeKeywords` and the default
`minScore: 1`. It is declared before `lookup`, so it wins every 1-1 tie via the
declaration-order tiebreak (`profile-router.ts:199`).

Verified with `explain()`:

| Prompt | Routes to | Should be |
|---|---|---|
| `what is the schema of the users table` | premium (Opus, high) | lookup |
| `show me where the auth token is read from config` | premium (Opus, high) | lookup |
| `summarize the migration files` | premium (Opus, high) | lookup |

**Fix:** set `"minScore": 2` on `premium`; narrow `token` → `auth token` /
`api token`; add `scopes` (weight 2) so genuinely high-stakes prompts still
clear the threshold on their own.

**Done when:** the three prompts above route to `lookup`, real premium prompts
(`rotate the api key credential`, `edit the migration schema`) still route to
`premium`, and `npm test` passes.

**Resolved 2026-07-21.** In `bundles.json` `premium`: added `"minScore": 2`;
split the keyword list so bare nouns (`schema`, `migration`, `secret`,
`credential`, `password`, `invariant`) stay weight 1 and need a second signal,
while single-signal destructive/credential actions (`api key`, `private key`,
`connection string`, `schema migration`, `database migration`, `force-push`,
`reset --hard`, `branch deletion`) moved to `scopes` (weight 2) so they still
trigger premium on their own. Bare `token` → `auth token` / `api token` /
`access token`, so "token budget"/"token count" no longer match.

Two regression tests added to the reachability suite in
`test/profile-router.test.ts`: one asserting the four read-only prompts land on
`lookup`, one asserting the six single-signal destructive prompts still land on
`premium`. Suite: 157/157 pass, typecheck clean.

---

## [x] 2. `hotfix` and `lookup` have no fallback — a failed resolve keeps the expensive model

**Severity:** high (silent spend)

`bundles.json` gives `hotfix` and `lookup` single-element model chains. When no
spec in the chain resolves, `profile-router.ts:616-624` warns once and
**continues on the current model** — so a `lookup` following a `premium` turn
runs on Opus if DeepSeek/Gemini is not credentialed.

**Fix:** every profile's chain ends with a cheap, always-available model rather
than falling through to the ambient one.

**Done when:** no profile has a single-element `model` array, and `npm test`
passes.

### Deeper bug found while fixing this: the chain never advanced on credential failure

The chain was strictly worse than documented. Per `API-FINDINGS.md`,
`ctx.models.resolve()` is catalog/alias-only and **never checks credentials**;
`pi.setModel()` is what reports a missing API key, by returning `false`. The old
loop broke out on the first *catalog-resolvable* spec and then called `setModel`
once — so an uncredentialed first link ended the chain with a warning and left
the session on its ambient model. README's claim that the fallback is "used
automatically when OpenRouter isn't credentialed" was never true: the fallback
only ever covered typos and missing catalog entries.

This is the same silent-spend failure as the config half, and strictly larger:
it fires even for profiles that already had a fallback.

**Resolved 2026-07-21.**

- `profile-router.ts` model block rewritten as a single walk over the chain: a
  `false` from `setModel` now advances to the next link instead of terminating.
  A user *decline* still stops the chain (declining means "stay here", not "try
  something cheaper"). An approval whose `setModel` then failed on credentials
  is deleted from the persisted decision map, so a later credentialed session
  asks again rather than inheriting an approval that never took effect. The
  exhausted-chain warning now distinguishes "no credentials for X" from "none
  could be resolved" and names the model being kept.
- `bundles.json`: `hotfix` → `deepseek-v4-flash` → `gemini-2.5-flash-lite` →
  `claude-sonnet-5`; `lookup` → `gemini-2.5-flash-lite` → `deepseek-v4-flash` →
  `claude-sonnet-5`. `premium` deliberately keeps its single-element
  `claude-opus-4-8` chain — a cheaper fallback there would defeat the safety
  floor, which is the whole point of the profile.
- Two regression tests added; the test harness's fake `setModel` grew a
  `denyCredentials` set so credential failure is simulable (empty by default, so
  existing tests are unaffected). Suite: 159/159 pass, typecheck clean.

---

## [x] 2b. README documents OpenRouter primaries that `bundles.json` does not have

**Severity:** medium (docs drift, undermines the cost story)

`README.md:45-51` lists `openrouter/...` primaries for all six non-premium
tiers. `bundles.json` contains zero `openrouter/` prefixes.

**Fix:** decide which is true — wire the OpenRouter primaries, or correct the
README table. Resolve alongside item 2 since both touch the model chains.

**Done when:** README's model column matches `bundles.json` exactly.

**Resolved 2026-07-21.** The docs were stale, not the config: DECISIONS #29/#30
already removed the `openrouter/*` prefixes deliberately, because they are not
entries in the installed pi-catalog and fail `resolve()` outright. `README.md`
and `MANUAL.md` never caught up.

- Both model tables rewritten to the actual native-provider chains, with the
  `premium` row noting it has no fallback link by design and the `minScore: 2`
  behavior from item 1.
- `MANUAL.md` §2 note claiming "`ctx.models.resolve()` only matches
  **credentialed** providers" was **factually wrong** and was the premise behind
  the item-2 chain bug. Corrected: `resolve()` is catalog/alias-only,
  `setModel()` reports credentials by returning false, and the chain advances on
  either signal.
- `MANUAL.md` schema block: the `model` comment no longer shows an
  `openrouter/x` example, and the previously-undocumented `verbs`, `scopes`,
  `excludeKeywords`, and `minScore` fields are now listed with their weights.

No `openrouter/`-prefixed model string remains in either user doc; the only
mentions left are the explicit warnings not to use that form.

---

## [x] 3. A declined model switch is remembered forever, invisibly

**Severity:** medium (silent spend + interruption tax)

`profile-router.ts:597-604` persists both accepts and declines to
`.omp/model-decisions.json`. One accidental "no" on a downgrade permanently
disables it with no UI indication. Separately, ~30 distinct `from→to` pairs
each prompt once — that is the interruption tax.

**Fix:**
- Auto-apply downgrades; confirm only upgrades. The confirm exists to prevent
  surprise spend, and routing *down* is not surprise spend.
- Add `/profile decisions [reset]` to list and clear remembered answers.

**Done when:** a downgrade applies without a confirm dialog, an upgrade still
confirms, `/profile decisions` lists the persisted map, and
`/profile decisions reset` clears both the map and the file.

**Resolved 2026-07-21.** "Downgrade" is decided from catalog data, not a
hardcoded model ranking: `Model.cost` carries `input`/`output` in $/million
tokens, so the new exported `isStrictDowngrade()` returns true only when the
target is cheaper on **both** axes with non-zero prices on both sides. Catalog
entries use `cost: 0` for *unpriced*, not *free*, so anything ambiguous — an
unpriced model, or cheaper on one axis and dearer on the other — falls through
to the normal confirm rather than auto-applying a switch of unknown price.

- Strict downgrades apply with no dialog, bypass the remembered-answer map
  entirely, and are never written to it — so a stale decline can no longer
  suppress a saving forever. Each one emits an info notification naming both
  models, so the change stays visible rather than becoming silent magic.
- Upgrades and ambiguous switches keep the existing confirm-once-and-remember
  behavior unchanged.
- New `/profile decisions [reset]` lists the persisted map with accept/decline
  per pair and clears it (map + file) on `reset`. `/profile stats` gained a
  "Model downgrades auto-applied (no confirm)" counter.
- 8 tests added (4 unit on `isStrictDowngrade`, 3 integration on the confirm
  path including a stale-decline regression, 1 on the new subcommand).
  Suite: 167/167 pass, typecheck clean.
- Docs updated: `MANUAL.md` §runtime step 7 rewritten, its troubleshooting
  section now leads with `/profile decisions`; `README.md` flow diagram and
  subcommand list updated.

---

## [x] 4. Telemetry cannot answer "where did my money go"

**Severity:** medium (no feedback loop on the router's whole purpose)

`logTelemetry` (`profile-router.ts:456-491`) records prompt / profile / margin /
runner-up. No resolved model, no thinking level — so `/profile telemetry`
reports routing accuracy but not spend. The log is also append-only forever
(`:487`) with no rotation.

**Fix:** add `resolvedModel` and `thinkingLevel` to each row; have
`/profile telemetry` print a routes-by-model breakdown; rotate the log at a size
cap.

**Done when:** new telemetry rows carry both fields, `/profile telemetry` shows
a per-model count, old rows without the fields still parse, and the log rotates.

**Resolved 2026-07-21.** Rows now carry `model` and `thinkingLevel`, and the
`logTelemetry` call **moved to after** the model/thinking blocks so it records
what the turn actually ran on rather than what the profile asked for. That
distinction is the whole value of the field: a declined switch, a fallthrough
chain, or a dead chain all leave the turn on the ambient model, and those are
exactly the rows that explain an unexpected bill. A regression test covers the
declined-switch case specifically.

- `/profile telemetry` gained a "Routes by model" section with count and share
  per model. Rows predating the field are counted as `(unrecorded)` rather than
  dropped, so an upgraded log still summarises cleanly.
- The log now rotates to `.profile-router-telemetry.log.1` (one generation,
  overwritten) past 1 MiB, checked before each append. Added to `.gitignore`
  explicitly — the existing `*.log` rule does **not** match a `.log.1` suffix.
- 4 tests added. Suite: 171/171 pass, typecheck clean.
- Docs updated: `MANUAL.md` runtime step 11 and its `/profile telemetry` entry
  (including dropping the now-false "grows without bound" privacy note),
  `README.md` subcommand list.

---

## [x] 5. Stickiness can inherit a read-only profile into an action prompt

**Severity:** medium (productivity, wasted turns)

`isStickyContinuation` (`profile-router.ts:178-182`) inherits the previous
profile for any prompt under 6 tokens. After a `lookup` turn, `now fix it`
inherits `lookup` — read-only toolset, `task` blocked, micro model — producing a
refusal or a failed edit instead of work.

**Fix:** do not inherit a `capabilities.write: false` profile when the
continuation contains an action verb (fix / change / add / remove / update /
delete). At minimum, notify on inheritance.

**Done when:** `now fix it` after a `lookup` turn does not inherit `lookup`, a
genuine continuation (`continue`, `ok`) still inherits, and `npm test` passes.

**Resolved 2026-07-21.** `classify()` now refuses to inherit a profile declaring
`capabilities.write: false` when the continuation contains an action verb (`fix`,
`change`, `add`, `remove`, `delete`, `update`, `edit`, `write`, `rename`,
`refactor`, `patch`, `apply`, `revert`, `implement`, `install`, `create`). Those
turns fall through to `default`, which has a full toolset. Write-capable profiles
inherit as before, and bare continuations (`ok`, `continue`, `go on`) are
untouched.

**Note — this inverted an existing test.** `test/profile-router.test.ts` had an
explicit assertion that `"now fix it"` inherits `investigation`, i.e. the old
behavior was deliberate, not accidental. It is still wrong: `investigation` has
no `edit`/`write` tool and carries a rule stating fixes happen in a separate
pass, so the inherited turn could only refuse or fail. The test was rewritten to
assert the new behavior with that rationale recorded inline, plus two new tests
covering the write-capable and bare-continuation cases. If you disagree with the
call, this is the one item in this document that changes previously-intended
behavior — revert it by dropping the `wantsToAct` check in `classify()`.

Suite: 173/173 pass, typecheck clean. Stickiness was undocumented in both user
docs; `MANUAL.md` gained a runtime step 4b describing it and this exception.

---

## [~] 6. Vocabulary gaps fall through to `default`  — partially done, rest blocked on data

**Severity:** low (missed savings)

`how many tokens does this prompt use` and `now fix it` both route to `default`
(minimax + medium thinking). `.profile-router-telemetry.log` already collects
exactly these under its default-route count.

**Fix:** mine the default-routed prompts in the telemetry log and promote the
recurring vocabulary into profile keywords.

**Done when:** the mined keywords are added and the reachability suite still
passes (it fails if a new keyword makes one profile outrank another on its own
trigger prompt).

**Partially done 2026-07-21 — the mining step is blocked.** There is no
`.profile-router-telemetry.log` in this checkout and no `.omp/misroutes.jsonl`,
so there is no corpus to mine. Inventing keywords from imagination is exactly
what the reachability suite exists to catch, so the bulk of this item waits for
real usage data. Re-run it after a few sessions of actual use — with item 4 in
place, the log now also records which model each missed prompt fell back to, so
the default routes can be ranked by what they cost rather than just counted.

Two gaps were already identified by hand during the review, and both are now
closed:
- `"now fix it"` — resolved by item 5, which is the correct fix (it should fall
  to `default`'s full toolset, not gain a keyword).
- `"how many tokens does this prompt use"` — `how many …` is a retrieval
  question, so `how many` was added to `lookup`'s keywords. Verified it does not
  collide: `"how many review findings are open"` still routes to `review` (2 vs
  1), and `"how many migrations are pending"` routes to `lookup` rather than
  `premium` thanks to item 1's `minScore`. Covered by a new test.

Suite: 174/174 pass, typecheck clean.

---

## Notes

- `bundles.json` is re-read from disk every prompt, so config-only items (1, 2,
  2b, 6) take effect on the next prompt with no restart.
- Run `npm run check` (typecheck + tests) after each item. The reachability
  suite is the collision safety net for keyword edits.
- Items 3, 4, 5 touch `profile-router.ts`; re-run `npm run install:global`
  afterwards if the extension is installed globally.
