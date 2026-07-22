# profile-router

An [OMP (`@oh-my-pi/pi-coding-agent`)](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent)
extension that classifies **every prompt** against a keyword-driven profile
table (`bundles.json`) and, per profile: injects engineering rules into the
system prompt, routes the model and thinking level, restricts the active
toolset, and blocks disabled subagents. The classifier itself makes **zero
LLM calls** — it's word-boundary keyword scoring, so routing costs nothing.

```
prompt ──► classify (keywords, no LLM) ──► merge matched profiles ──► apply
                                                                       ├─ rules → system prompt (this turn only)
                                                                       ├─ model → downgrades auto-apply; anything else confirms once per (from→to), persisted across sessions
                                                                       ├─ thinkingLevel → silent
                                                                       ├─ tools → setActiveTools (🔒 in status; baseline auto-restored when no profile restricts)
                                                                       └─ disabledAgents → task-tool calls blocked
```

## Files

| File | What it is |
|---|---|
| `profile-router.ts` | The whole extension — one file, Node built-ins only |
| `bundles.json` | The profile table (the part you edit) |
| `bundles.schema.json` | JSON Schema for `bundles.json` — provides editor validation/autocomplete via the `$schema` key |
| `MANUAL.md` | Install paths, schema reference, runtime behavior, troubleshooting |
| `API-FINDINGS.md` | file:line evidence for every OMP API the extension calls |
| `DECISIONS.md` | Every autonomous judgment call, numbered and justified |
| `test/profile-router.test.ts` | Unit + reachability + regression suite (`npm test`) |
| `scripts/install-global.ts` | Copies the extension + config to the global `~/.omp` paths (`npm run install:global`) |
| `salvage/` | The source material the 7 profiles were synthesized from |

## The shipped profiles

Every tier except `premium` runs a **cheap-first fallback chain**: a cheap
native-provider primary, ending in a reliably-credentialed model (a profile's
`model` is an array; the chain advances past any spec that fails to resolve
*or* that the session has no credentials for). Model strings use native
`provider/id` form — `openrouter/*` prefixes are not catalog entries and would
fail to resolve; OpenRouter proxies these same strings at runtime. All model
strings are verified against the installed catalog (see `MANUAL.md` §2 for
drop-in alternates: DeepSeek, Gemini 2.5, MiniMax M3, IBM Granite micro, Qwen
instruct, Trinity preview).

| Profile | Triggers on | Model chain (primary → fallback) | Thinking | Tools | Character |
|---|---|---|---|---|---|
| `lookup` | find / where is / explain / summarize / overview | `google/gemini-2.5-flash-lite` → `deepseek/deepseek-v4-flash` → Sonnet | low | read, grep, glob, lsp, ast_grep | Retrieval + summarisation, read-only, subagents blocked |
| `hotfix` | hotfix / quick fix / urgent fix | `deepseek/deepseek-v4-flash` → `google/gemini-2.5-flash-lite` → Sonnet | low | read, edit, bash | Reversible fixes under time pressure; guardrails never lowered |
| `investigation` | root cause / debug / trace / reproduce | `minimax/minimax-m3` → Sonnet | medium | + lsp, ast_grep, bash | Read-only root-causing; symptom patches rejected |
| `implementation` | implement / build feature / write code | `minimax/minimax-m3` → Sonnet | medium | full write set + lsp, ast_grep | Build against a settled plan |
| `architecture` | design / redesign / cross-cutting | `deepseek/deepseek-v4-pro` → Sonnet | high | read-only + lsp, ast_grep | Decides system shape; does not implement |
| `review` | review / audit / pre-merge | `deepseek/deepseek-v4-pro` → Sonnet | high | read-only + lsp, ast_grep | Findings only, no edits, max 2 fix cycles |
| `premium` | destructive/credential actions, or 2+ high-stakes signals | Opus (no cheap primary, no fallback — deliberate safety floor) | high | full set + lsp, ast_grep | Safety floor — guardrails never lowered |

`premium` carries `"minScore": 2`, so a single bare noun (`schema`,
`migration`, `secret`) no longer reaches it — "what is the schema of the users
table" stays on the cheap `lookup` tier. Single-signal destructive actions
(`api key`, `force-push`, `reset --hard`, `branch deletion`, …) are weight-2
`scopes` and still trigger it on their own.

Multiple profiles can match one prompt: `rules`/`skills`/`tools` union,
`disabledAgents` intersect (safety-conservative), `model`/`thinkingLevel`
go to the highest-scoring match.

## Exploration standard

Every code-exploring profile carries OMP's built-in `lsp` and `ast_grep`
tools plus the rule: **locate via LSP symbols/definitions/references or
ast_grep structural patterns before plain grep or bulk reads**. Structural
search returns precise `file:line` spans instead of whole files — which is
exactly why `lookup` can run on a cheap micro/instruct-class model: it
summarises the spans the tools found rather than reasoning over bulk
context.

## Using it optimally

- **Let keywords do the routing; pin only for exceptions.** `/profile <name>`
  pins, `/profile clear` unpins, `/profile` shows scores. The status line
  (`⚙ lookup`) always shows what matched — glance at it before the model
  starts spending tokens; a `🔒` suffix means the profile restricted the
  toolset (auto-restored on the next unrestricted prompt). Add `--once` (`/profile <name> --once`) to pin for
  just the next prompt — it auto-clears immediately after that one prompt is
  classified, so you don't have to remember to `/profile clear` afterward.
- **Pause routing entirely with `/profile off` (`/profile on` to resume).** A
  kill switch for the whole router: while off, every prompt passes through untouched —
  no model routing, no thinking-level or toolset changes, no rule injection, no
  agent blocking, exactly as if the extension weren't installed. `off` takes
  effect immediately (it also lifts any active `🔒` toolset restriction) and the
  status line shows `⏸ off`. Unlike `/profile clear` (which only unpins and
  leaves auto-classification running), `off` stops the router completely. The
  state **persists across sessions** — it is written to
  `.omp/routing-state.json`, so a project left with routing off comes back off
  after you exit and reopen omp; run `/profile on` to resume (or delete the
  file). New projects with no state file default to on.
- **Discover and debug with the `/profile` subcommands:**
  - `/profile list` — every profile with its one-line description, model, and
    thinking level.
  - `/profile debug on` (`off` to stop) — prints a per-prompt routing trace
    showing which keywords each profile matched, the scores, and the winner,
    so you can see *why* a profile was chosen. Off by default.
  - `/profile explain <text>` — stateless routing trace for a given prompt text,
    showing how it would classify without sending it or changing any session state.
  - `/profile validate` — structural check of `bundles.json` (duplicate names,
    empty keywords, bad `thinkingLevel`/`model`) without sending a prompt.
  - `/profile stats` — session counters: prompts classified per profile (including default), manual pins set, model switches accepted/declined, and downgrades auto-applied without a confirm.
  - `/profile decisions` (`reset` to clear) — the remembered model-switch
    answers behind `.omp/model-decisions.json`. A decline is otherwise
    invisible: the switch just stops being offered, in every future session.
    Strict downgrades ignore this map entirely.
  - `/profile telemetry` — summary of the routing log: per-profile route counts,
    **routes by model** (what each turn actually ran on — the spend view),
    default (no-match) routes — the prompts your vocabulary missed — and
    low-margin routes one stray keyword away from flipping profile. Every
    routing decision (default included) is logged to
    `.profile-router-telemetry.log` (gitignored; prompt text truncated to 200
    chars; rotates at 1 MiB).
  - `/profile rules` — prints the exact rules/skills block currently being injected into the system prompt for the active profile.
  - `/profile misroute [expected-profile]` — logs the last classified prompt
    (truncated to 500 chars), what it matched, and (optionally) what profile
    you expected, as one JSON line appended to `.omp/misroutes.jsonl`. Useful
    for building a corpus of misclassifications to fix later.
- **Phrase prompts with trigger vocabulary.** "summarize how auth works"
  routes to the cheap model; "investigate why auth breaks" routes to Sonnet
  with root-cause rules. The keyword table *is* the API.
- **Edit `bundles.json`, not the extension.** JSON is the only authoring path
  — there is no add/edit command, by design (it's git-diffable and testable).
  It's re-read from disk on every prompt — changes apply on the next prompt, no
  restart. After the first prompt in a session, if the extension detects that
  `bundles.json` content has changed, it notifies once with the new content hash
  (a short 12-hex fingerprint), so you can see when config edits take effect.
  Run `/profile validate` (or `npm test`) after editing to catch
  mistakes. Add an optional `description` to each profile for a friendly
  `/profile list`.
- **Run `npm test` after editing profiles.** The reachability suite fails
  if a new keyword makes one profile outrank another on its own trigger
  prompt — that's the collision safety net.
- **Keep rules terse (3–10 imperatives).** Every matched profile's rules
  are unioned into the system prompt, so a bloated profile taxes every
  prompt that matches it.
- **Cheap-model failure is safe.** A model string the user has no
  credentials for (or a typo) produces one warning and continues on the
  current model — never a crash, never a silent downgrade.

## Install / develop

See `MANUAL.md` §1 for install paths (project: `.omp/extensions/` +
`.omp/bundles.json`; global: `~/.omp/agent/extensions/` — note the
`agent/` segment). For global scope, the copy is scripted:

```sh
npm run install:global         # copy extension + config to ~/.omp (idempotent)
npm run install:global:check   # report drift only; non-zero exit if stale
```

It copies rather than symlinks — see `MANUAL.md` §1 for why — so re-run it
after editing `profile-router.ts` or `bundles.json`. Development:

```sh
npm install        # dev deps only (typescript + the OMP package for types)
npm run check      # strict typecheck + full test suite
```

The `@oh-my-pi/pi-coding-agent` version is pinned deliberately (exact version, not a range) due to upstream release cadence; bumping it is a manual, deliberate action. After bumping, re-run `npm run check` to confirm nothing broke.
