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
                                                                       ├─ model → confirm dialog, remembered per (from→to)
                                                                       ├─ thinkingLevel → silent
                                                                       ├─ tools → setActiveTools (only if non-empty)
                                                                       └─ disabledAgents → task-tool calls blocked
```

## Files

| File | What it is |
|---|---|
| `profile-router.ts` | The whole extension — one file, Node built-ins only |
| `bundles.json` | The profile table (the part you edit) |
| `MANUAL.md` | Install paths, schema reference, runtime behavior, troubleshooting |
| `API-FINDINGS.md` | file:line evidence for every OMP API the extension calls |
| `DECISIONS.md` | Every autonomous judgment call, numbered and justified |
| `test/profile-router.test.ts` | Unit + reachability + regression suite (`npm test`) |
| `salvage/` | The source material the 7 profiles were synthesized from |

## The shipped profiles

Cheap tiers run on non-Anthropic instruct-class models; judgment tiers stay
on Sonnet/Opus. All model strings are verified against the installed
catalog (see `MANUAL.md` §2 for drop-in alternates: DeepSeek, Gemini 2.5,
MiniMax M3, IBM Granite micro, Qwen instruct, Trinity preview).

| Profile | Triggers on | Model | Thinking | Tools | Character |
|---|---|---|---|---|---|
| `lookup` | find / where is / explain / summarize / overview | `google/gemini-2.5-flash-lite` | low | read, grep, glob, lsp, ast_grep | Retrieval + summarisation, read-only, subagents blocked |
| `hotfix` | hotfix / quick fix / urgent fix | `deepseek/deepseek-v4-flash` | low | read, edit, bash | Reversible fixes under time pressure; guardrails never lowered |
| `investigation` | root cause / debug / trace / reproduce | Sonnet | medium | + lsp, ast_grep, bash | Read-only root-causing; symptom patches rejected |
| `implementation` | implement / build feature / write code | Sonnet | medium | full write set + lsp, ast_grep | Build against a settled plan |
| `architecture` | design / redesign / cross-cutting | Sonnet | high | read-only + lsp, ast_grep | Decides system shape; does not implement |
| `review` | review / audit / pre-merge | Sonnet | high | read-only + lsp, ast_grep | Findings only, no edits, max 2 fix cycles |
| `premium` | schema / migration / secret / credential | Opus | high | full set + lsp, ast_grep | Safety floor — guardrails never lowered |

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
  starts spending tokens.
- **Phrase prompts with trigger vocabulary.** "summarize how auth works"
  routes to the cheap model; "investigate why auth breaks" routes to Sonnet
  with root-cause rules. The keyword table *is* the API.
- **Edit `bundles.json`, not the extension.** It's re-read from disk on
  every prompt — changes apply on the next prompt, no restart.
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
`agent/` segment). Development:

```sh
npm install        # dev deps only (typescript + the OMP package for types)
npm run check      # strict typecheck + full test suite
```
