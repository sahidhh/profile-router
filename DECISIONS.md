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
