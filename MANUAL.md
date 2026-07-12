# profile-router — User Manual

An OMP (`@oh-my-pi/pi-coding-agent`) extension that reclassifies every prompt
against a keyword-driven profile table (`bundles.json`), injects the merged
engineering rules into the system prompt, routes model/thinking-level, and
blocks disabled subagents — all with zero LLM calls in the classifier itself.

See `API-FINDINGS.md` for the empirical evidence behind every API call this
extension makes, and `DECISIONS.md` for every autonomous judgment call made
while authoring `bundles.json` and wiring the runtime.

---

## 1. Install

The extension is one file (`profile-router.ts`) plus one config file
(`bundles.json`). OMP auto-discovers extensions from two locations, in this
precedence order (CLI-injected > project settings > user settings; see
`API-FINDINGS.md` §(a)):

| Scope | Extension path | Config path |
|---|---|---|
| Project (recommended for a team) | `<repo>/.omp/extensions/profile-router.ts` | `<repo>/.omp/bundles.json` |
| Global, default profile | `~/.omp/agent/extensions/profile-router.ts` | `~/.omp/bundles.json` |
| Global, named profile `X` | `~/.omp/profiles/X/agent/extensions/profile-router.ts` | `~/.omp/bundles.json` (not profile-scoped — this extension's own config, not OMP core config) |

**Note**: the global path is `~/.omp/agent/extensions/`, *not*
`~/.omp/extensions/` — the `agent/` segment is required (verified against
the installed package's discovery source; see `API-FINDINGS.md` §(a)).

Steps:

1. Copy `profile-router.ts` to one of the extension paths above.
2. Copy `bundles.json` to the matching config path above (project scope
   checks `.omp/bundles.json` first; if absent, falls back to the global
   `~/.omp/bundles.json`).
3. **Project scope only**: OMP only scans `.omp/` for extensions if that
   directory is non-empty. Since `bundles.json` also lives there, this is
   satisfied automatically — you don't need an extra placeholder file.
4. Restart your OMP session, or run `/reload` if your session supports it,
   so the extension is picked up.
5. Send any prompt and check the status line (bottom of the TUI) for
   `⚙ <profile-name>` — that confirms the extension loaded and is
   classifying.

---

## 2. `bundles.json` schema reference

```jsonc
{
  "default": {                    // used only when NO profile matches a prompt
    "model": "provider/id",
    "thinkingLevel": "low|medium|high",
    "rules": ["..."]
  },
  "profiles": [
    {
      "name": "unique-name",       // shown in status line and /profile
      "keywords": ["..."],         // word-boundary, case-insensitive; multi-word phrases OK ("root cause")
      "rules": ["..."],            // terse imperatives, injected into system prompt
      "skills": ["..."],           // informational — surfaced as a "Recommended Skills" hint block
      "tools": ["..."],            // active toolset when this profile (or the union of matches) is non-empty
      "disabledAgents": ["..."],   // subagent names to block via the `task` tool's `agent` param
      "disabledTools": ["..."],    // tool names hard-blocked at tool_call (e.g. ["edit","write","bash"]) — the Sentinel oath
      "maxMinions": 3,             // cap on live `task` subagents — the Monarch summon cap (omit = uncapped)
      "noConfirm": false,          // auto-accept model switches without a dialog — the Berserker flag
      "model": "provider/id",      // e.g. "anthropic/claude-sonnet-5" — resolved via ctx.models.resolve()
      "thinkingLevel": "low|medium|high"
    }
  ]
}
```

A profile with an **empty `keywords` list** is a **class build**: it is never
auto-classified, and is only reachable via `/equip <name>` (or `/profile
<name>`). See §8.

**Merge semantics** (fixed, do not redesign — see `API-FINDINGS.md` and the
mission's hard constraints):

- `rules`, `skills`, `tools`: **union with dedup** across every matched
  profile.
- `disabledTools`: **union** across matched profiles — the *opposite* of
  `disabledAgents`. A tool block is a safety oath, so any matched profile
  that blocks a tool wins; a co-matched permissive profile can never dilute
  it. Enforced at `tool_call` by exact `toolName` (`edit`/`write`/`bash`/…).
- `disabledAgents`: **intersection** across matched profiles — an agent is
  blocked only if *every* matched profile disables it. One matched profile
  that needs an agent keeps it enabled for the whole merged set.
- `maxMinions`: **minimum** of the values that matched profiles declare (the
  tightest cap wins); profiles that omit it don't loosen the cap. If no
  matched profile declares it, summons are uncapped.
- `noConfirm`: **OR** — if any matched profile sets it, model switches this
  turn are auto-accepted (no confirm dialog). Guardrails still apply; only
  the dialog is skipped.
- `model`, `thinkingLevel`: **single-value** — the highest-scoring matched
  profile wins; ties break on declaration order in `bundles.json` (earlier
  wins). The shipped config declares the generic `lookup` profile **last**
  specifically so a tie between `lookup` and any more specific profile
  (`premium`, `investigation`, `implementation`, ...) resolves to the
  specific profile — see `VERIFICATION-REPORT.md` "Post-audit fixes".
- No match: falls back to `default` (if present); `disabledAgents`,
  `disabledTools`, `maxMinions`, and `noConfirm` all come from `default`
  (empty / undefined / false if unset).

### The authored config, annotated

`bundles.json` (in this repo) declares 7 profiles synthesized from
`salvage/SALVAGE-platform.md`'s 7 canonical Execution Profiles (EP-*) plus
one profile (`lookup`) that salvage didn't directly supply — see
`DECISIONS.md` for why.

| Profile | Salvage source | Model tier | Why |
|---|---|---|---|
| `lookup` | Synthesized: EP-Investigation's read-only tool policy + EKC's "retrieval, not judgment → Haiku" cost rule | Haiku (cheap), low thinking | Lightweight search/find/explain; tools restricted to `read`/`grep`/`glob`; subagents disabled |
| `architecture` | EP-Architecture | Sonnet, high thinking | Heavy/thinking profile for system design — decides, doesn't build |
| `implementation` | EP-Implementation | Sonnet, medium thinking | Build against a settled plan |
| `review` | EP-Review | Sonnet, high thinking | Multi-pass audit; findings only, no edits |
| `investigation` | EP-Investigation | Sonnet, medium thinking | Root-cause debugging; read-only |
| `premium` | EP-Premium | Opus, high thinking | Schema/secrets/migrations — the T1 safety-floor profile |
| `hotfix` | EP-FastCheap | Haiku, low thinking | Reversible UI fixes under time pressure; guardrails still apply |

---

## 3. Runtime behavior

On **every** prompt submission (`before_agent_start`):

1. `bundles.json` is read fresh from disk (project path checked first, then
   global) — edits take effect on the next prompt, no restart needed.
2. The prompt text is lowercased and matched against every profile's
   `keywords` with word-boundary regexes (`\bkeyword\b`), so `"fix"` won't
   match inside `"prefix"`. Each hit is worth 1 point per matched keyword.
3. Matches are sorted by score descending, then by declaration order in
   `bundles.json` ascending (tiebreak).
4. If a manual override is pinned (`/profile <name>`), that profile is used
   with an effectively infinite score, ignoring keyword matching. If the
   pinned name no longer exists in `bundles.json` (renamed/removed since it
   was pinned), the override is cleared automatically, a warning notifies
   you of the fallback, and auto-classification resumes for that prompt —
   the status line will **not** show `(manual)` next to whatever
   auto-classified profile happens to match.
5. Fields are merged per the semantics above.
6. **Status line** updates to `⚙ profile-a+profile-b` (or `⚙ default` on no
   match; `(manual)` suffix when pinned).
7. **Model routing**: if the merged `model` resolves to a different model
   than the current session model, you get a one-tap confirm dialog
   (`ctx.ui.confirm`) naming the suggesting profile and the target model.
   Your answer is remembered for that exact `(from → to)` model pair for
   the rest of the session — you won't be asked again for the same switch.
   If you decline, nothing changes. If the resolved model has no
   credentials, you get a warning telling you to run `/model <spec>`
   manually instead. If the profile's `model` string can't be resolved at
   all (typo, provider not installed), you get a one-time warning per
   session naming the profile and the bad model string, then the session
   continues on the current model.
8. **Thinking level** and **active tools** are applied silently (no
   confirm) — thinking level is a low-stakes generation parameter; the
   active-tools update only happens when the merged `tools` list is
   non-empty, so a no-match prompt never strips your toolset.
9. **Rules injection**: if the merged `rules` (or `skills`) list is
   non-empty, a block is appended to the system prompt for that turn only:
   ```
   ## Active Engineering Rules (profile-a+profile-b)
   - rule one
   - rule two

   ## Recommended Skills
   - skill-name
   ```
   If nothing matched and `default` has no rules, nothing is appended —
   zero UI/prompt noise.
10. **Tool blocking**: on every `tool_call`, if the tool's `toolName` is in
    the merged `disabledTools` list, the call is blocked
    (`{ block: true, reason: "..." }`) — the Sentinel oath. Separately, for
    the built-in `task` tool, the call is blocked if the invoked agent
    (`input.agent`, defaulting to `"task"`) is in `disabledAgents`, **or** if
    the number of live summons has reached `maxMinions` (the Monarch cap).
11. **Summon accounting** (Monarch): a `task` reserves a slot when approved
    at `tool_call` and releases it at `tool_execution_end`; the live count
    hard-resets to 0 at the start of each gate (`before_agent_start`) so a
    lost end-event can never leak permanently.

Two out-of-band hooks fire independently of the per-prompt flow:

- **🔥 Embers** (`session.compacting`): when the session compacts, the active
  profile's `rules` are re-injected into the compaction summary as preserved
  context, and you're notified `🔥 Ember restored`. Without this, per-gate
  rules silently vanish when context is compacted.
- **🩸 Poison** (`credential_disabled`): if a provider credential is
  soft-disabled (e.g. OAuth `invalid_grant`) and OMP falls back to a backup
  model, a persistent `☠ fallback: <provider> disabled` status marker is set
  and you're warned — so you never *unknowingly* run on the backup.

---

## 4. Command reference

- `/profile` — show the active profile(s), match scores, resolved model,
  thinking level, disabled agents, blocked tools, and summon cap.
- `/profile <name>` — pin classification to a single named profile until
  cleared. Rejects unknown names with the list of profiles actually loaded
  from `bundles.json` (helps catch typos immediately, never silently no-ops).
- `/profile clear` — remove the pin and resume automatic keyword
  classification on the next prompt.
- `/equip <name>` / `/equip clear` — flavored alias of `/profile` for
  equipping class builds (see §8). Same machinery.
- `/arise` — Shadow Extraction (two forms):
  - **`/arise [profile]`** — asks the model to distill exactly **one** reusable
    rule (follow-up prompt), then **auto-captures** its next terminal answer:
    you get a confirm dialog with the distilled rule, and on approval it's
    appended to `profile`'s `rules`. With no `profile`, the currently active
    profile is the target. `/arise clear` disarms a pending capture.
  - **`/arise <profile> <rule text>`** — persist a rule you already have,
    directly (same confirm + dedup).
  - Always: manual approval, one rule per extraction, deduped.
- `/rank` — Hunter Rank card: gates cleared per class, bosses (high/max-thinking
  gates) fought, bonfires (git commits) lit, and any active poison.
  **Persists across sessions** in `hunter-rank.json` next to your `bundles.json`.

---

## 5. Adding or editing a profile safely

1. Add/edit an entry in `bundles.json`'s `profiles` array. Keep `rules` to
   3–10 terse imperatives — every matched profile's rules get unioned into
   the system prompt, so a bloated list on one profile taxes every prompt
   that matches it.
2. **Check for keyword collisions before saving.** Run the test suite
   (`npm test`) — it includes a reachability test per profile
   (`test/profile-router.test.ts`, "bundles.json reachability" suite) that
   asserts each profile's own realistic trigger prompt makes that profile
   win (`hits[0].profile.name === name`). If you add a keyword that
   overlaps an existing profile's trigger vocabulary, that test will start
   failing for whichever profile got outranked — that's the safety net.
3. To manually sanity-check a new keyword against the whole table without
   writing a test, use a quick Node one-liner:
   ```sh
   node --experimental-strip-types -e '
     import("./profile-router.ts").then(async (m) => {
       const bundles = JSON.parse(require("fs").readFileSync("bundles.json", "utf-8"));
       console.log(m.classify("your test prompt here", bundles));
     })'
   ```
   Confirms which profiles match and their scores before you commit.
4. If two profiles legitimately should both fire on the same prompt (e.g.
   a security-flavored implementation task), that's fine — merge semantics
   are additive for `rules`/`skills`/`tools` and safety-conservative for
   `disabledAgents` (intersection, not union) by design.
5. Model/thinkingLevel changes only apply to the highest-scoring match, so
   if you want a new profile's model to actually take effect over an
   existing one for shared keywords, it needs to out-score it (more
   matched keywords) or be declared earlier for tie-break purposes.

---

## 6. Troubleshooting

**Extension not loading / status line never shows `⚙`**
- Confirm the file is at the correct path for your scope (§1) — the
  global path is `~/.omp/agent/extensions/`, not `~/.omp/extensions/`.
- For project scope, confirm `.omp/` is non-empty (it needs at least
  `bundles.json` or the extension file itself alongside it).
- Run with `PROFILE_ROUTER_DEBUG=1` (see below) and check `~/.omp/logs/`
  for load errors.

**Profile not matching the way you expect**
- Run `/profile` after sending the prompt to see the actual match scores.
- Remember: matching is word-boundary substring, not fuzzy/semantic. A
  keyword must appear as a whole word or phrase in the prompt — `"debug"`
  will **not** match `"debugging"` (no word boundary between `debug` and
  the following `ging`). List both forms explicitly if you want both to
  trigger the same profile.
- Check for a **manual override** left pinned from a previous session
  (`/profile clear`).

**Model switch not happening**
- Check you approved the confirm dialog — declining is remembered for that
  `(from → to)` pair and won't ask again.
- Check for a "No credentials available" warning — the model resolved but
  you have no API key/OAuth for that provider. Run `/model <spec>`
  manually once credentials are configured.
- If `ctx.models.resolve()` can't resolve your `bundles.json` model string
  at all (typo, provider not installed), you get a warning notification
  naming the profile and the unresolved model string (once per session per
  model string), and the session continues on the current model. With
  `PROFILE_ROUTER_DEBUG=1` a matching debug log line also records "model not
  resolvable".

**Malformed or missing `bundles.json`**
- The extension never crashes the session on bad config. A parse failure
  or a config missing the `profiles` array triggers exactly one warning
  notification (not repeated every prompt) and the session proceeds with
  zero profiles (`default` fallback behavior, or plain passthrough if
  `default` is also absent).

**Known limitation**: model switching depends entirely on
`ctx.models.resolve()` + `pi.setModel()`, both real, verified APIs (see
`API-FINDINGS.md` §(c)) — there is no fallback-to-`/model`-only mode
needed, unlike what an unverified scaffold might have assumed. Both failure
modes — missing credentials, and an unresolvable model string — are
surfaced as a warning, never a silent no-op.

**Debug logging**: set `PROFILE_ROUTER_DEBUG=1` in the environment OMP runs
in. Emits `pi.logger.debug("[profile-router] ...")` lines (classification
result per prompt, unresolvable-model notices) to OMP's file logger
(`~/.omp/logs/`).

---

## 7. Manual acceptance test (run after install)

Send these 5 prompts in order in a fresh session and confirm the noted
behavior. Each exercises a different mechanism.

1. **`"can you find where the auth middleware is defined and explain how it works"`**
   Expect: status line shows `⚙ lookup`; a model-switch confirm appears if
   your current model isn't the configured cheap model; system prompt gains
   a "lookup" rules block.

2. **`"I need to design a new module for the notification system, cross-cutting several services"`**
   Expect: status line shows `⚙ architecture`; thinking level rises to
   `high`; rules block mentions layering/abstraction rules.

3. **`"this touches a schema migration and rotates a credential/secret token"`**
   Expect: status line shows `⚙ premium`; model suggestion is the highest
   tier configured; rules block includes the GD1/GD2/GD3 guardrail text.

4. **`/profile hotfix`** then **`"anything"`**
   Expect: status line shows `⚙ hotfix (manual)` regardless of prompt
   content, since the override is pinned. Confirms `/profile <name>` works.

5. **`/profile clear`** then **`"nothing relevant to any profile at all xyzzy"`**
   Expect: status line shows `⚙ default`; no rules block is injected unless
   `default.rules` is non-empty in your `bundles.json` (it is, by default,
   in the shipped config — expect the two baseline rules).

---

## 8. ARSENAL — class builds

The shipped `bundles.json` also declares six **class builds** on top of the
seven task profiles. A class build is a keyword-less profile: it is never
auto-classified — you *equip* it deliberately with `/equip <name>` (or
`/profile <name>`), and clear it with `/equip clear`. Classes are the "gear
axis" — they set the model tier, tool loadout, and subagent policy for a
run; the task profiles are the "what am I doing" axis. Equipping a class
replaces auto-classification for as long as it's pinned.

| Class | Model | Loadout | What it's for |
|---|---|---|---|
| **wretch** | Haiku, low | `read`/`grep`/`glob`, subagents off | The SL1 challenge run — clear a gate with the least possible spend. Lookups, one-liners. |
| **vanguard** | Sonnet, medium | full standard tools, subagents off | The daily driver. 80% of implement/fix/refactor sessions. |
| **archmage** | Opus, high | full tools, subagents off (delegates to no one) | Architecture/design/migration boss fights. Deliberate, expensive, rare. |
| **monarch** | Sonnet, low | `read`/`grep`/`glob` + `task`, **subagents on, `maxMinions: 3`** | Thin orchestrator: a cheap general commanding expensive soldiers. A real cost architecture. |
| **sentinel** | Sonnet, high | `read`/`grep`/`glob`, **`edit`/`write`/`bash` hard-blocked** | A reviewer that *physically cannot* modify files. Equip before any review — the oath is the permission model. |
| **berserker** | Sonnet, medium | full tools, **`noConfirm: true`** | Long unattended runs — skips model-switch dialogs. Equip knowingly; guardrails still hold. |

Class mechanics you'll see at runtime:

- **Sentinel** — try to `edit` while it's equipped and the call is blocked
  with `Tool "edit" is forbidden by the sentinel oath`.
- **Monarch** — the 4th simultaneously-live `task` is blocked with *"Your
  army is at its limit, Monarch."* A slot frees when a subagent returns.
- **Berserker** — model switches apply without a confirm dialog (you'll get
  an `⚔ Berserker: switching…` notice instead).

**🗡 Shadow Extraction (`/arise`)** grows a profile's rule library from actual
experience instead of upfront speculation: after a hard session, `/arise
[profile]` asks the model to distill one reusable rule and **auto-captures**
its answer for your approval (via a `message_end` listener); `/arise <profile>
<rule>` persists a rule you already have. One rule per extraction, manual
approval always.

**🏆 Hunter Rank (`/rank`)** persists to `hunter-rank.json` beside your
`bundles.json` — gates per class, bosses fought, bonfires (commits) lit. Add
`hunter-rank.json` to your `.gitignore` if `bundles.json` lives in your repo
(this project's `.gitignore` already does).

**Deferred by design** (honesty): *Bleed* (a context-fill meter) and *Elixir*
(a free-tier rate-limit meter) are **not** built — OMP exposes no token-count
or rate-limit-headroom read surface to an extension (only reactive 429s), so
a meter would be guesswork. See `DECISIONS.md`.

**Verification**: `npm run check` runs typecheck + the Node unit/handler suite.
`npm run test:integration` (needs `bun`) additionally loads the extension
through OMP's **real** `loadExtensionFromFactory` + `ConcreteExtensionAPI` and
drives every mechanic — see `test/integration/real-loader.integration.ts`. The
only unexercised seam is the live provider call (needs credentials): run the
§7–§8 checks by hand in a real `omp` session.
