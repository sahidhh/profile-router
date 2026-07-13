# DECISIONS.md — Autonomous decisions made while building `profile-router`

Every decision below was made without user confirmation per the mission's
instruction to make the most conservative reasonable call and record it
here. Ordered roughly by the phase in which it arose.

---

## Phase 0 — API verification

1. **`ExtensionAPI` over `HookAPI`**: not really a judgment call — the
   evidence forced it. `HookAPI`'s `before_agent_start` result type has no
   system-prompt field at all (`hooks/types.ts:426-429`), so a hook literally
   cannot satisfy the mission's "inject merged rules into system prompt"
   requirement. Recorded here anyway because the scaffold's `TODO(VERIFY)`
   treated it as an open question; it isn't one.

2. **Rejected the `systemPromptAppend` field seen in `examples/extensions/pirate.ts`**
   in favor of the typed `systemPrompt: string[]` field, because
   `systemPromptAppend` does not exist in either the source or the
   *compiled* `.d.ts` that `tsc` actually checks against
   (`dist/types/extensibility/extensions/types.d.ts:606-609`). The example
   is stale relative to the shipped types. Using it would fail strict
   typecheck (Definition of Done requirement #3) even though it apparently
   works at runtime for that specific example.

3. **Corrected the extension install path** in the header comment and
   `MANUAL.md` from the scaffold's `~/.omp/extensions/` to the verified
   `~/.omp/agent/extensions/` (default profile) — confirmed via three
   independent sources: `discovery/builtin.ts`'s `getConfigDirs()`,
   `pi-utils/dirs.ts`'s `getConfigAgentDirName()`, and the shipped
   `pirate.ts` example's own install comment. Treated three-source
   agreement as sufficient evidence without further confirmation.

---

## Phase 1 — `bundles.json` authoring

4. **Profile set: 7 profiles, not the salvage's literal 7 EP-\* names.**
   `SALVAGE-platform.md` explicitly rates "all 7 profiles fully supported,
   no invented rows" for `EP-Premium/Investigation/Review/Architecture/
   Implementation/Documentation/FastCheap`. The mission separately requires
   *"at least one lightweight profile (search/find/explain tasks) → cheap
   model, minimal tools, subagents disabled."* None of the 7 EP-* profiles
   is a search/lookup profile — `EP-Investigation` is read-only but T2
   (Sonnet, not cheap); `EP-FastCheap` is cheap but about hotfixes, not
   search. Rather than invent an 8th profile (exceeding the 4–7 cap) or
   silently drop a mission requirement, I **dropped `EP-Documentation`**
   (the least load-bearing of the 7 per the mission's own required-coverage
   list, which names lightweight/heavy/implementation/review/debug but not
   documentation) and **added a synthesized `lookup` profile**, built from
   `EP-Investigation`'s read-only tool policy (`SALVAGE-platform.md` §3.4)
   combined with the EKC salvage's cost rule *"Loading/compressing
   summaries, dependency retrieval, budget check → Haiku (retrieval, not
   judgment)"* (`SALVAGE-ekc.md` §3.3). This is exactly the
   "SALVAGE content is thin for a required profile — author sensible
   defaults and flag it" case the mission anticipates.

5. **Model IDs: real current Anthropic model strings, not the salvage's
   literal `anthropic/claude-sonnet-4-6`.** The salvage's concrete mapping
   table (`SALVAGE-platform.md` §3.3) cites `claude-opus-4-8`,
   `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` — but `claude-sonnet-4-6`
   is not a real model (per the session's own model-identity context, the
   current Sonnet is `claude-sonnet-5`). I preserved the salvage's *tier
   structure* (T1 Opus / T2–T3 Sonnet / T4 Haiku) but substituted the real
   current IDs (`claude-opus-4-8`, `claude-sonnet-5`,
   `claude-haiku-4-5-20251001`), all in `provider/id` form since that's what
   `ctx.models.resolve()` accepts and the salvage's own table already used
   that format for the provider prefix.

6. **`provider/id` model strings over OMP role aliases** (`pi/slow`,
   `pi/smol`, etc.). Role aliases are resolved through
   `settings.getModelRole()` (`config/model-resolver.ts:963`) — they only
   work if the *installing user* has configured `modelRoles` in their OMP
   settings, which `bundles.json` cannot assume. Concrete `provider/id`
   strings resolve unconditionally (once the provider has credentials),
   which is the safer default for a config file meant to be dropped into an
   arbitrary user's setup.

7. **`thinkingLevel` schema restricted to `low|medium|high`** even though
   the runtime accepts an 8-value `ThinkingLevel` union (`inherit`, `off`,
   `minimal`, `low`, `medium`, `high`, `xhigh`, `max` —
   `pi-agent-core/src/thinking.ts:8-17`). This matches the mission's Phase 1
   schema spec verbatim (`"thinkingLevel": "low|medium|high"`) and keeps
   authoring simple; nothing stops an operator from using a wider value
   since the extension casts the string through without validation.

8. **Keyword lists deliberately avoid bare `"fix"`, bare `"build"`,
   bare `"review"`-adjacent generic terms that would collide.** E.g.
   `hotfix` uses multi-word phrases (`"quick fix"`, `"ui bugfix"`) instead
   of bare `"fix"`, specifically so it doesn't collide with
   `investigation`'s root-cause vocabulary. Verified empirically via the
   per-profile reachability test suite, not just by inspection.

9. **`skills` field treated as informational, not invocable.** No verified
   OMP API exists for an extension to programmatically trigger a named
   skill/slash-command from inside a hook (only `getCommands()` to *list*
   them). `skills` is surfaced as a "Recommended Skills" hint block appended
   to the system prompt alongside the rules block — visible to the LLM,
   but not force-invoked. This keeps constraint #2 (no compiler/pipeline
   machinery) intact — no execution graph is built.

---

## Phase 2 — extension implementation

10. **`pi.setActiveTools(next.tools)` wired in, guarded by
    `next.tools.length > 0`.** The mission's Phase 2 checklist only names
    rules-injection and model-routing explicitly, not tools. But hard
    constraint #4 explicitly names `tools` as a union-merged list field
    alongside `rules`/`skills`, and Phase 1's schema requires authoring a
    `tools` array per profile — leaving it merged-but-inert would make an
    authored field silently do nothing, which reads as a half-finished
    implementation rather than conservative scope discipline. The guard
    (only call when non-empty) is the conservative half of the decision:
    it prevents a no-match prompt or a tools-less profile from ever
    force-clearing the active toolset via an accidental
    `setActiveTools([])`.

11. **`pi.setThinkingLevel()` applied silently, without the confirm gate
    that gates model switches.** The mission's Phase 2 point 2 only
    describes confirm+memoize behavior for *model* routing. Thinking level
    is a same-provider generation parameter (no cost-tier jump, no
    credential dependency, synchronous call, no failure mode to surface),
    so gating it behind a dialog would be UI noise without a matching
    safety benefit. Hard constraint #4 groups `model` and `thinkingLevel`
    together as "single-value fields," which is a merge-semantics grouping,
    not a UI-behavior grouping — I did not read it as requiring identical
    confirm treatment.

12. **Global `bundles.json` fallback kept exactly as the mission specified
    it (`~/.omp/bundles.json`)**, rather than aligning it to
    `getAgentDir()`'s profile-scoped `~/.omp/agent/bundles.json` /
    `~/.omp/profiles/<name>/agent/bundles.json` convention that the
    *extension file* itself follows. `bundles.json` is this extension's own
    config, not a native OMP config surface discovered by OMP's loader
    (unlike the extension `.ts` file, whose location is dictated by OMP's
    discovery code) — the mission's Phase 2 point 5 states the two-path
    resolution order explicitly and unconditionally, so I treated it as a
    direct instruction rather than a `TODO(VERIFY)`. Flagged here in case
    profile-scoped OMP installs expect otherwise.

13. **`disabledAgents` enforcement scoped to the `task` tool only.** The
    only subagent-invocation surface found anywhere in the installed
    package is the built-in `task` tool (`src/task/index.ts:453`, `agent`
    param defaulting to `"task"` per `src/task/types.ts:114`). No other
    tool or event carries a subagent identity. Scoping the block check to
    `event.toolName === "task"` is therefore complete, not partial.

14. **Malformed-config warning fires once per path per process, not once
    per session or once ever.** `warnedPaths` is a module-level `Set`
    (survives across prompts within one loaded extension instance, resets
    on extension reload/session restart). This matches "notify once" from
    the mission literally while still re-surfacing the warning if the user
    reloads their session after fixing (or re-breaking) the file.

---

## Phase 3 — verification

15. **Test runner: Node's built-in `node:test`, zero new dependencies.**
    Hard constraint #5 ("Node built-ins only for runtime deps") is about
    the extension's *runtime* dependencies, not dev tooling, but pulling in
    Vitest/Jest for a project this size would work against the same
    "minimal footprint" spirit stated in the same constraint. `node:test` +
    `node:assert/strict`, run via `node --experimental-strip-types`
    (confirmed working on the installed Node 22.22.2), needed nothing new
    in `package.json`.

16. **Deep runtime smoke test (loading the extension through the real
    `ConcreteExtensionAPI`/`loadExtensionFromFactory` internals under
    `bun`) was performed manually and its results recorded in
    `API-FINDINGS.md`, but the script itself was not committed.** It
    deep-imports package-internal paths (`@oh-my-pi/pi-coding-agent/
    extensibility/extensions/loader`) that are not part of the package's
    public `dist/types/index.d.ts` surface — committing it as a permanent
    test would silently break on any internal refactor upstream, unrelated
    to a real regression in `profile-router.ts`. The committed suite
    exercises the same behavior through `classify()`/`merge()`/
    `loadBundles()` directly (implementation-stable) plus a public-API-
    shaped stub for the extension-load path.

17. **The packaged `omp` CLI binary (`dist/cli.js`) does not run in this
    environment** (`SyntaxError: Unexpected identifier 'K'` under both
    `node --experimental-strip-types` and `bun`) — this is a pre-existing
    issue in the published bundle, not something introduced by this work.
    Documented in `API-FINDINGS.md` and `MANUAL.md` §6 rather than worked
    around, since silently patching a third-party vendor bundle would be
    outside this mission's scope and would not reflect what an end user
    installing the real package experiences.

---

## Phase 4 — manual

18. **5-prompt acceptance test in `MANUAL.md` uses the exact reachability
    prompts already proven correct by the automated test suite**
    (`test/profile-router.test.ts`'s `reachabilityPrompts` fixture), so the
    manual test a human runs by hand is guaranteed consistent with what CI
    already verified — no drift between "what we tested" and "what we tell
    the user to try."

---

## Phase 5 — cheap-tier diversification + LSP/AST exploration standard

19. **Cheap-tier profiles routed off Anthropic** per the maintainer's
    request ("token efficient profiles don't just use claude variants").
    `lookup` → `google/gemini-2.5-flash-lite`, `hotfix` →
    `deepseek/deepseek-v4-flash`. Both strings verified to exist in the
    installed `@oh-my-pi/pi-catalog` `models.json` (v16.4.1) under a
    first-party provider **and** as raw OpenRouter ids, so they resolve
    through either credential path (`matchModel` tries exact
    `provider/id` first, then exact raw-id — `config/model-resolver.ts`).
    Judgment tiers (Sonnet/Opus) deliberately left on Anthropic — the
    request scoped diversification to "simple tasks". Alternates the
    maintainer named (MiniMax M3, IBM Granite micro, Qwen instruct,
    Trinity preview) are catalog-verified and documented as drop-ins in
    `MANUAL.md` §2 rather than shipped as defaults, since which one is
    best depends on which provider the installing user has credentials
    for; an unresolvable choice degrades to a one-time warning by design.

20. **"thy3 preview" interpreted as Arcee's Trinity large preview**
    (`arcee-ai/trinity-large-preview`) — the only preview-suffixed
    cheap-model family in the catalog whose name plausibly abbreviates to
    "thy/trinity"; no catalog entry matches "thy" literally. Recorded as
    an interpretation, not a fact; trivially swappable in the manual's
    table if a different model was meant.

21. **LSP/AST-first exploration standardized across all code-exploring
    profiles.** OMP ships built-in `lsp` and `ast_grep` tools (names
    verified in `src/tools/builtin-names.ts`); both were added to the
    `tools` list of every profile that explores code, and the shared
    search-first rule was rewritten to name them explicitly ("lsp for
    symbols/definitions/references, ast_grep for code patterns, before
    falling back to plain grep or bulk reads"). Rationale: structural
    search returns precise spans instead of whole files, which is what
    makes a micro/instruct-class model viable for `lookup` — it
    summarises located spans rather than reasoning over bulk context.
    `ast_edit` was deliberately **not** added anywhere: no profile's
    rules motivate structural rewriting, and hotfix's minimal toolset
    (`read`/`edit`/`bash`) is a deliberate ceremony floor left untouched.

22. **`lookup` extended with summarisation vocabulary**
    (`summarize`/`summarise`/`summary`/`overview`/`walkthrough`) instead
    of adding an 8th "summarise" profile — summarisation is the same
    "retrieval, not judgment" workload `lookup` already models, and the
    4–7 profile cap (constraint from the original mission) would be
    exceeded by a new profile. Collision-checked against every other
    profile's keywords and the reachability prompt fixture; a dedicated
    reachability test for the new vocabulary was added.

23. **Model fallback chains + OpenRouter-first routing on every tier
    except `premium`** (follow-up to #19, requested by the maintainer:
    "cheaper models via openrouter … keep current as fallback").
    `Profile.model` widened to `string | string[]`; the extension walks
    the winning profile's chain in order and uses the first spec
    `ctx.models.resolve()` can match, warning (once) only when the whole
    chain is dead. Shipped chains: architecture/review →
    `openrouter/deepseek/deepseek-v4-pro`, implementation/investigation/
    default → `openrouter/minimax/minimax-m3`, hotfix →
    `openrouter/deepseek/deepseek-v4-flash`, lookup →
    `openrouter/google/gemini-2.5-flash-lite`, each with the previous
    model as fallback. `premium` deliberately keeps Opus with no cheap
    primary: it fires on schema/secrets/migrations/destructive-git,
    where a wrong answer costs more than any token budget — flagged in
    `MANUAL.md` as a one-line change for operators who disagree.

---

## Phase 6 — profile discoverability (list / debug / validate)

24. **Discoverability delivered as `/profile` subcommands, not process
    flags.** The maintainer asked for a `--help`-style listing and a
    `--debugger`. This extension has no argv parser — its only user surface
    is the slash command registered via `pi.registerCommand("profile", …)`
    — so the asks were mapped to `/profile list`, `/profile debug on|off`,
    and `/profile validate` rather than inventing a flag layer that the OMP
    host would never route to. Same capability, native surface.

25. **Optional `description` field, display-only.** Added to the `Profile`
    interface (and populated for all 7 shipped profiles) purely so
    `/profile list` has a human-readable summary to show. It is never read
    by `classify`/`scoreProfile`/`merge` — routing stays 100% keyword-driven,
    so adding/omitting a description can never change which profile wins. The
    reachability suite is untouched and still green, confirming no behavioral
    coupling.

26. **Debugger is a persistent session toggle, not one-shot.** Chosen with
    the maintainer over an on-demand `/profile why <text>`. While on,
    `before_agent_start` renders an `explain()` breakdown (matched keywords,
    per-profile scores, chosen winner) via `ctx.ui.notify` on *every* prompt,
    which is what "show why a profile is chosen every request" asked for. Kept
    deliberately separate from the pre-existing `PROFILE_ROUTER_DEBUG=1` env
    flag: that logs to `pi.logger.debug` (invisible in the UI and set before
    launch), whereas the toggle is the interactive, in-session path. The flag
    is session-only and never persisted to `bundles.json`.

27. **Scoring refactored into a shared `scoreProfile()`; no behavior change.**
    The per-profile keyword loop was extracted from `classify` into
    `scoreProfile(text, profile) → { score, matched }` so both `classify`
    (score only) and the new `explain` (score + which keywords claimed a span)
    reuse one matcher, including the intra-profile overlap-dedup logic (F4).
    `classify`'s return shape is unchanged, so every existing unit/reachability
    /regression test passes as-is.

28. **JSON stays the only authoring path; added `/profile validate` instead of
    an add/edit writer.** Chosen with the maintainer. A programmatic
    `/profile add|edit` would mutate `bundles.json` behind the user's back and
    risk silently breaking the reachability guarantees; keeping JSON as the
    single, git-diffable, test-guarded source of truth preserves review-as-code.
    `/profile validate` (backed by the pure, unit-tested `validateBundles()`)
    closes the ergonomics gap — structural checks (duplicate names, empty
    keywords, bad `thinkingLevel`/`model`) without having to send a prompt.

---

## Phase 7 — T1 provider/model verification

29. **Catalog-resolution fix for openrouter/* model strings.** Automated catalog
    verification revealed that `openrouter/minimax/minimax-m3`,
    `openrouter/deepseek/deepseek-v4-pro`, `openrouter/deepseek/deepseek-v4-flash`,
    and `openrouter/google/gemini-2.5-flash-lite` do not exist as entries in the
    installed pi-catalog `models.json` (v16.4.1). These strings fail
    `ctx.models.resolve()` and would break the fallback chain at runtime; users
    would see "model not resolvable" warnings even though OpenRouter can proxy these
    models (verified by live API test). **Replaced with native provider equivalents:**
    `minimax/minimax-m3`, `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`,
    `google/gemini-2.5-flash-lite` — all catalog-verified under their first-party
    providers per pi-catalog `models.json`. Trade-off: these models now require
    their native provider credentials (MINIMAX_API_KEY, DEEPSEEK_API_KEY,
    GOOGLE_API_KEY) to call directly, but OpenRouter users with OPENROUTER_API_KEY
    can still access them via OpenRouter's proxy (at runtime, not through this
    extension's routing — model resolution uses native provider). Documented as
    OpenRouter proxy-access is outside the catalog's scope; model resolution is
    credential-aware and falls back gracefully per design (see
    `config/model-resolver.ts` `resolveModelOverrideWithAuthFallback`). All native
    provider model IDs are now live-verified to work when credentials are present.
    Anthropic models (claude-sonnet-5, claude-opus-4-8) remain unchanged as they
    are direct native entries in the catalog and do not require the openrouter/*
    prefix.
    Documented as the answer to "is JSON the only way to edit profiles?" in
    both `README.md` and `MANUAL.md`.

---

## Phase 8 — T1 provider/model verification (stabilization session)

30. **All native-provider model strings verified live and catalog-resolved.** Systematic
    re-verification of the 6 unique model strings across bundles.json (minimax/minimax-m3,
    anthropic/claude-sonnet-5, deepseek/deepseek-v4-pro, anthropic/claude-opus-4-8,
    deepseek/deepseek-v4-flash, google/gemini-2.5-flash-lite) confirms:
    - **Catalog**: All 6 resolve via case-insensitive matching in pi-catalog
      `models.json` under their respective first-party providers (verified via
      `getProviderModelIndex` logic in `model-resolver.ts:382-397`).
    - **Credentialed**: Only `OPENROUTER_API_KEY` is available in this environment;
      all 6 models require their native provider credentials (ANTHROPIC_API_KEY,
      DEEPSEEK_API_KEY, MINIMAX_API_KEY, GOOGLE_API_KEY) for direct calls, which are
      NOT present.
    - **Live via OpenRouter**: All 6 models confirmed working via OpenRouter API
      (`openrouter.ai/api/v1/chat/completions`) with minimal test requests; OpenRouter
      proxies all of them under their standard `provider/id` format (e.g.
      `minimax/minimax-m3`, `anthropic/claude-sonnet-5`). Trade-off aligns with
      decision #29: native provider strings resolve through the catalog, users with
      only OpenRouter credentials still access via OpenRouter's proxy layer at runtime.
    - **No bundled changes required**: Current bundles.json model strings are correct
      and unmodified; decision #29's removal of `openrouter/*` prefixes was the right
      move.
    - **Scope cut (out of v1)**: Google AI Studio (free tier, billed per-user not
      per-request) and NVIDIA NIM (enterprise-only, requires on-prem deployment) are
      explicitly out of scope — their tiers are not added to bundles.json.

| Model | Catalog | Credentialed | Live (OpenRouter) |
|-------|---------|--------------|-------------------|
| minimax/minimax-m3 | ✓ (as MiniMax-M3) | ✗ | ✓ |
| anthropic/claude-sonnet-5 | ✓ | ✗ | ✓ |
| deepseek/deepseek-v4-pro | ✓ | ✗ | ✓ |
| anthropic/claude-opus-4-8 | ✓ | ✗ | ✓ |
| deepseek/deepseek-v4-flash | ✓ | ✗ | ✓ |
| google/gemini-2.5-flash-lite | ✓ | ✗ | ✓ |

---

## Phase 12 — Q2 bundles.json JSON Schema

35. **JSON Schema draft-07 for bundles.json with partialProfile definition.** Created `bundles.schema.json` to provide editor autocomplete and validation for `bundles.json`. The schema defines two object types: `profile` (for items in the `profiles[]` array) with `required: ["name", "keywords"]`, and `partialProfile` (for the top-level `default` key) with no required fields. This split is necessary because the real `default` block in bundles.json omits `name` and `keywords` — a `Partial<Profile>` in TypeScript terms. Added `$schema: "./bundles.schema.json"` as the first key in `bundles.json` so JSON-Schema-aware editors (VS Code, etc.) automatically provide validation and autocomplete. Both definitions have `additionalProperties: false` to enforce strict shape; the top-level schema allows the `$schema` property explicitly. The extension's type assertion (`JSON.parse(raw) as Bundles`) and validation (`validateBundles()`) already tolerated unknown keys without modification, so the feature required zero changes to profile-router.ts — verified by running the full test suite.

---

## Phase 13 — Q3 /profile stats

36. **Session counters: what counts, when to count, and sort order.** Added four module-level session counters (`promptsClassified` Map, `manualPinsSet`/`modelSwitchesAccepted`/`modelSwitchesDeclined` integers) incremented at classification, pin, and model-routing decision points. **Classification counting**: multi-match prompts increment the counter for *every* matched profile name, not just the winner, because each matched profile contributes to the merged config (rules union, tool union, etc.). Single-profile matches increment that name; no-match prompts increment "default". **Model-switch counting**: increments fire *every time* a switch decision is applied this turn, including cached decisions from prior turns (retrieved from `modelDecisions` map). This counts every actual switch-or-reject event from the user's perspective, not just first-time decisions. **Sort order**: `promptsClassified` entries sorted by count descending (highest-count profiles first), breaking ties with no stable secondary sort — the order of insertion is deterministic across runs because `classify()` always processes profiles in declaration order. `/profile stats` notifies the exact message `"no prompts classified yet"` when all counters are zero (no activity), preventing confusion between "stats not generated yet" and "stats generated and all zero"; on activity, one multi-line `ctx.ui.notify` displays the stats table in a compact format with profile names and counts, then manual pins and model switch totals.

---

## Phase 9 — T2 rule-union contradiction fix

31. **Rule-language reworded to describe working-style, not permission/prohibition.** 
    Four profiles (`architecture`, `review`, `investigation`, `lookup`) had enforcement-style language 
    ("read-only", "do not edit/write", "no edits") in their `rules` arrays — statements that 
    re-expressed capability restrictions already encoded in the `tools` array. When two profiles 
    co-match (e.g. `implementation` + `lookup`), the merged `rules` union would produce a contradictory 
    system prompt: "do not edit" rules from `lookup` union with "write/edit/bash" tools from `implementation`, 
    even though `merge()`'s tool union correctly restricts capability (the `tools` array is the sole source 
    of enforcement). 
    
    **Option A chosen per scope constraint**: reword the 4 rules to describe *working style* (what the 
    profile focuses on/does), not permission statements, leaving `tools` arrays unchanged:
    - `architecture` "Decide system shape; do not implement. Read and compare alternatives only." 
      → "Decide system shape by reading and comparing alternatives; implementation is a separate, later step."
    - `review` "Review does not fix — findings only, no code edits." 
      → "Review produces severity-tiered findings; a separate pass implements any accepted fix."
    - `investigation` "Read-only: no edits during investigation, only tracing and analysis." 
      → "Investigation stays in tracing and analysis mode; fixes happen in a separate pass once the cause is confirmed."
    - `lookup` "Read-only: do not edit or write files in this profile." 
      → "This profile is retrieval and summarisation; edits happen in a separate implementation pass."
    
    Added regression test in `test/profile-router.test.ts` that classifies a co-matching prompt 
    (`implementation` + `lookup`), merges the rules, and asserts no prohibition text (`/read-only/i`, 
    `/do not (edit|write)/i`, `/no (code )?edits?/i`) appears in the merged result.

---

## Phase 10 — T3 mid-run compaction rule re-injection

32. **`session.compacting`'s `context` field chosen over `prompt` or
    `preserveData`.** `SessionCompactingResult` exposes three independent
    optional fields (`dist/types/extensibility/shared-events.d.ts:276-284`).
    `prompt` overrides the compaction step's own instructions — using it to
    carry the rules block would mean rewriting what the summarizer is told
    to do, a far larger and riskier surface than just adding content.
    `preserveData` stores structured data attached to the compaction entry
    for the extension's own later retrieval, with no documented guarantee it
    flows back into the text the model sees post-compaction. `context` is
    documented as "Additional context lines to include in summary" — exactly
    the additive, non-invasive shape wanted, and it mirrors the existing
    `before_agent_start` → `systemPrompt` append pattern already used
    elsewhere in this extension rather than introducing a new mechanism.

33. **Scoped to mid-run compaction only — not a replacement for
    `before_agent_start`'s rule injection.** `before_agent_start` already
    re-injects the merged rules block into `systemPrompt` once per new
    prompt (Phase 0/2 above), so a fresh prompt always carries the current
    profile's rules regardless of this handler. `session.compacting` fires
    *between* prompts, mid-turn, when the agent auto-compacts context
    during a long agentic run — without this handler, if compaction drops
    the messages that carried the rules injection, the rules would be
    silently absent from the compacted context until the next prompt
    re-triggers `before_agent_start`. This handler closes exactly that gap:
    it reads the same closure-scoped `active: MergedConfig | null` that
    `before_agent_start` already populates (no new state), is a no-op when
    `active` is `null` (no prompt classified yet) or `active.rules` is
    empty (matched profile declares no rules, or default profile with no
    rules), and otherwise returns the identical rules-block formatting
    string already used for `systemPrompt` injection, for consistency.

---

## Phase 11 — Q1 /profile misroute

34. **JSONL append format for misroute logging.** `/profile misroute
    [expected-profile]` logs classification misses as one JSON object per
    line to `.omp/misroutes.jsonl`, appending if the file exists (no
    destructive rewrites). JSONL is streaming-friendly and pairs well with
    line-by-line analysis scripts. Prompt text is truncated to 500 chars to
    avoid unbounded file growth on very long prompts. `matched` is derived
    from the session-scoped `active` state (populated by `before_agent_start`),
    so stale classification is impossible — misroutes log exactly what the
    last real prompt matched. The `expected` field is the optional
    `[expected-profile]` argument (a profile name, or null if omitted) — not
    the profile that *should have* matched (unknowable without human
    judgment), but what the user believes the correct routing was. Validation
    reuses the existing error UX from plain `/profile <name>` pin-rejection
    (unknown profile names are rejected with the same message listing known
    profiles). No write occurs if no prompt has been classified (`lastPrompt`
    is still null) or if validation fails, avoiding noise when the feature
    is experimented with on fresh sessions or against malformed bundles.

---

## Phase 14 — Q4 /profile rules

37. **Shared `buildInjectionBlock(cfg: MergedConfig) → string | null` helper
    extracts the rules/skills formatting logic.** The exact injection block that
    `before_agent_start` appends to the system prompt is now computed by a pure
    helper function, reusable by both `before_agent_start` (which appends to
    `systemPrompt` and returns early if block is null) and the new `/profile rules`
    subcommand (which notifies the block directly). Behavior is byte-identical to
    before — same string content, same conditions — because the helper contains
    only the block-building logic, not the systemPrompt-append or return/early-exit
    semantics (those stay in the caller). `/profile rules` without a classification
    (`active === null`) notifies the same "No classification yet — send a prompt first"
    message used elsewhere for consistency, and on a matched profile with zero rules
    and zero skills, notifies an explicit "No rules or skills declared for the active
    profile (…)" message rather than silencing — since `/profile rules` is an explicit
    user request, clarity matters more than zero UI noise. By contrast,
    `before_agent_start` stays silent when nothing matched and no rules are declared,
    because it's a per-turn background event; the asymmetry (explicit request →
    message, background event → silence) is conservative and expected.

---

## Phase 15 — Q5 config-change notice

38. **Config-change detection via content hash, scoped to `before_agent_start` only.**
    The extension now notifies once per session when `bundles.json` content changes
    between prompts (first load is always silent). Implementation: a small
    `configContentHash()` helper duplicates `loadBundles()`'s candidate-path logic
    and returns a short sha256 hash (first 12 hex chars, human-scannable) of the
    first-existing file's raw bytes, or null if missing/unreadable. Session state
    tracks the last hash in `lastConfigHash`; on each `before_agent_start` call, if
    the current hash differs from the last non-null hash, exactly one `info` notification
    fires with format `bundles.json changed (<12-hex>) — applied`. The notification
    is scoped to `before_agent_start` only (read-only inspection subcommands like
    `/profile list`/`/profile validate`/`/profile explain` do not trigger it), because
    only `before_agent_start` represents the config actually being *applied* to a turn.
    Why not modify `loadBundles` itself: returing a hash from `loadBundles` would
    couple notification logic to config loading, and exportable return-type changes
    violate the "do not change `loadBundles`'s exported signature or behavior"
    constraint — a separate helper keeps the concerns orthogonal. Why
    sha256-first-12-hex: full hashes are unreadable; 12 hex chars (48 bits) are
    collision-unlikely for session-local identity and remain human-scannable in
    notifications; longer truncations add no value for a per-session notice.
    Malformed/missing config leaves `lastConfigHash` untouched (only updates on
    successful hash reads), so a transient read glitch never erases session-level
    hash memory.
