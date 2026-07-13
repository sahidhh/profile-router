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
      "description": "one-liner",  // optional; human summary shown by /profile list (never affects routing)
      "keywords": ["..."],         // word-boundary, case-insensitive; multi-word phrases OK ("root cause")
      "rules": ["..."],            // terse imperatives, injected into system prompt
      "skills": ["..."],           // informational — surfaced as a "Recommended Skills" hint block
      "tools": ["..."],            // active toolset when this profile (or the union of matches) is non-empty
      "disabledAgents": ["..."],   // subagent names to block via the `task` tool's `agent` param
      "model": "provider/id",      // or a fallback chain: ["openrouter/x", "anthropic/y"] — first spec
                                   // that resolves against a credentialed provider wins (ctx.models.resolve())
      "thinkingLevel": "low|medium|high"
    }
  ]
}
```

**Merge semantics** (fixed, do not redesign — see `API-FINDINGS.md` and the
mission's hard constraints):

- `rules`, `skills`, `tools`: **union with dedup** across every matched
  profile.
- `disabledAgents`: **intersection** across matched profiles — an agent is
  blocked only if *every* matched profile disables it. One matched profile
  that needs an agent keeps it enabled for the whole merged set.
- `model`, `thinkingLevel`: **single-value** — the highest-scoring matched
  profile wins; ties break on declaration order in `bundles.json` (earlier
  wins). A `model` value may itself be a **fallback chain** (array of
  specs); the winning profile's chain is walked in order and the first
  spec that resolves against a credentialed provider is used. Only if
  *every* spec in the chain fails to resolve does the one-time warning
  fire and the session stay on the current model. The shipped config declares the generic `lookup` profile **last**
  specifically so a tie between `lookup` and any more specific profile
  (`premium`, `investigation`, `implementation`, ...) resolves to the
  specific profile — see `VERIFICATION-REPORT.md` "Post-audit fixes".
- No match: falls back to `default` (if present); `disabledAgents` becomes
  whatever `default.disabledAgents` says (empty if unset).

### The authored config, annotated

`bundles.json` (in this repo) declares 7 profiles synthesized from
`salvage/SALVAGE-platform.md`'s 7 canonical Execution Profiles (EP-*) plus
one profile (`lookup`) that salvage didn't directly supply — see
`DECISIONS.md` for why.

Every tier except `premium` ships an **OpenRouter-first fallback chain**:
a cheaper OpenRouter-routed model as primary, with the previous model as
fallback (used automatically when OpenRouter isn't credentialed).

| Profile | Salvage source | Model chain (primary → fallback), thinking | Why |
|---|---|---|---|
| `lookup` | Synthesized: EP-Investigation's read-only tool policy + EKC's "retrieval, not judgment → cheap model" cost rule | `openrouter/google/gemini-2.5-flash-lite` → `google/gemini-2.5-flash-lite`, low | Lightweight search/find/explain/summarise; LSP/AST-first exploration; tools restricted to `read`/`grep`/`glob`/`lsp`/`ast_grep`; subagents disabled |
| `architecture` | EP-Architecture | `openrouter/deepseek/deepseek-v4-pro` → `anthropic/claude-sonnet-5`, high | Heavy/thinking profile for system design — decides, doesn't build |
| `implementation` | EP-Implementation | `openrouter/minimax/minimax-m3` → `anthropic/claude-sonnet-5`, medium | Build against a settled plan |
| `review` | EP-Review | `openrouter/deepseek/deepseek-v4-pro` → `anthropic/claude-sonnet-5`, high | Multi-pass audit; findings only, no edits |
| `investigation` | EP-Investigation | `openrouter/minimax/minimax-m3` → `anthropic/claude-sonnet-5`, medium | Root-cause debugging; read-only |
| `premium` | EP-Premium | `anthropic/claude-opus-4-8` (no cheap primary — deliberate), high | Schema/secrets/migrations — the T1 safety-floor profile |
| `hotfix` | EP-FastCheap | `openrouter/deepseek/deepseek-v4-flash` → `deepseek/deepseek-v4-flash`, low | Reversible UI fixes under time pressure; guardrails still apply |

`premium` is the one tier deliberately left on Opus with no cheaper
primary: it fires on schema, secrets, migrations, and destructive git
operations, where the cost of a wrong answer dwarfs token spend. If you
want it cheaper anyway, it's a one-line change to a chain like
`["openrouter/deepseek/deepseek-v4-pro", "anthropic/claude-opus-4-8"]`.

### Cheap-tier models: not just Claude variants

Token-efficient work ("retrieval/mechanical work, not judgment") doesn't
need Anthropic models — any competent cheap instruct-class model does the
job, and the fallback-chain mechanism makes trying one risk-free. All of
the following strings are **verified against the installed
`@oh-my-pi/pi-catalog` `models.json`** (v16.4.1) and are drop-in
candidates for any profile's `model` chain:

| Family | `bundles.json` string | Resolves via |
|---|---|---|
| Gemini 2.5 Flash-Lite | `google/gemini-2.5-flash-lite` | `google` first-party, or OpenRouter (same string is a raw OpenRouter id) |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` | same dual path |
| DeepSeek V4 Flash | `deepseek/deepseek-v4-flash` | `deepseek` first-party, or OpenRouter (`deepseek/deepseek-v4-flash:free` also exists) |
| DeepSeek V3.2 | `deepseek/deepseek-v3.2` | OpenRouter |
| MiniMax M3 | `minimax/minimax-m3` | `minimax` first-party (`MiniMax-M3`), or OpenRouter |
| IBM Granite 4.0 micro | `ibm-granite/granite-4.0-h-micro` | Kilo (raw id match) |
| IBM Granite 4.1 8B | `ibm-granite/granite-4.1-8b` | OpenRouter / CoreWeave / Kilo |
| Qwen 2.5 7B Instruct | `qwen/qwen-2.5-7b-instruct` | OpenRouter |
| Trinity preview ("thy3 preview") | `arcee-ai/trinity-large-preview` | OpenRouter (`:free` variant exists) / Kilo / NanoGPT |

Notes:

- `ctx.models.resolve()` only matches **credentialed** providers. Strings
  in `provider/id` form fall back to raw-id matching, so
  `google/gemini-2.5-flash-lite` resolves through OpenRouter even without
  a Google key (OpenRouter ids are themselves `vendor/model` shaped). To
  *force* OpenRouter routing, prefix explicitly:
  `openrouter/google/gemini-2.5-flash-lite`.
- Picking a model the user has no credentials for is safe: the chain
  falls through to the next candidate, and only a fully-dead chain warns
  (once) and continues on the current model — never a silent degrade or
  a crash (see §6).
- Keep judgment work (schema, security, architecture verdicts) on the
  premium tiers; the cheap tier is for retrieval, summarisation, and
  small reversible edits.

### Exploration standard: LSP + AST first, cheap model summarises

Every profile that explores code (`lookup`, `investigation`,
`architecture`, `review`, `implementation`, `premium`) now carries OMP's
built-in `lsp` and `ast_grep` tools (verified names in
`src/tools/builtin-names.ts`) and a shared rule: **locate via LSP
symbols/definitions/references or `ast_grep` structural patterns before
plain grep or bulk file reads**. Structural search returns precise
`file:line` spans instead of whole files, which is what makes routing
`lookup` to a micro/instruct-class model viable — the model only has to
summarise the spans the tools already found, not reason over bulk
context.

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
10. **Subagent blocking**: on every `tool_call` for the built-in `task`
    tool, if the invoked agent (`input.agent`, defaulting to `"task"`) is
    in the merged `disabledAgents` list, the call is blocked with a reason
    shown to the LLM (`{ block: true, reason: "..." }"`).

---

## 4. `/profile` command reference

- `/profile` — show the currently active profile(s), their match scores,
  resolved model, thinking level, and disabled agents.
- `/profile <name>` — pin classification to a single named profile until
  cleared. Rejects unknown names with the list of profiles actually loaded
  from `bundles.json` (helps catch typos immediately, never silently no-ops).
- `/profile clear` — remove the pin and resume automatic keyword
  classification on the next prompt.
- `/profile list` — list every profile loaded from `bundles.json` with its
  `description` (or, if none, its keywords), model, and thinking level. The
  quickest way to see what's available.
- `/profile debug [on|off]` — toggle a per-prompt routing trace. While on,
  each prompt emits an `info` notification showing which keywords each profile
  matched, the per-profile scores, and the chosen winner (or a note when a
  manual pin bypassed classification, or when nothing matched and `default`
  applied). Bare `/profile debug` flips the current state. Off by default; the
  session-only flag never persists to disk. Distinct from the
  `PROFILE_ROUTER_DEBUG=1` env var, which logs to the host logger instead of
  the UI.
- `/profile validate` — structural check of the loaded `bundles.json`:
  duplicate profile names, missing/empty `keywords`, unknown `thinkingLevel`,
  and malformed `model`. Reports `✓ valid` or an itemized list of problems —
  no prompt needed.
- `/profile misroute [expected-profile]` — logs the last classified prompt
  (truncated to 500 chars), the profiles it matched, and (optionally) the
  profile you expected it to match, as a single JSON line appended to
  `.omp/misroutes.jsonl` (created if not present). Requires at least one
  prompt to have been classified in this session. If `[expected-profile]` is
  provided, it must be a known profile name; unknown names are rejected with
  the same error message as `/profile <unknown-name>`. Useful for collecting
  misclassification examples to analyze and fix keyword collisions.

---

## 5. Adding or editing a profile safely

**JSON is the only authoring path.** There is no `/profile add` / `/profile edit`
command by design — `bundles.json` is git-diffable and guarded by the test suite,
so profiles are edited as JSON and reviewed like code. Use `/profile validate`
(and `npm test`) to check your edits.

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
