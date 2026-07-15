# DECISIONS

Append-only log of blockers and resolved questions.

---

## OPEN: Charter question (blocks #9)

Is profile-router single-runtime (OMP, OpenRouter slugs OK) OR vendor-neutral multi-runtime? bundles.json currently hardcodes OpenRouter slugs, contradicting the neutral charter. BLOCKS #9.

Status: RESOLVED → see RESOLVED below

---

## RESOLVED: T4 model ID verification — rejected subagent's proposed "fix"

T4 subagent (summary 05-verify-model-ids.md) reported 5/6 model IDs PASS via
OpenRouter web search, but flagged `anthropic/claude-opus-4-8` as DEAD,
proposing correction to `anthropic/claude-opus-4.8` (dot instead of hyphen),
citing an OpenRouter page as source.

Orchestrator overrode this: this session's own system context states the
verified model ID as `claude-opus-4-8` (hyphens), consistent with Anthropic's
established naming convention (all known IDs — `claude-sonnet-5`,
`claude-haiku-4-5-20251001` — use hyphens, never dots). Web search results
about a very recently released model are prone to hallucinated/incorrect
slugs scraped from unreliable pages. No change made to bundles.json.

Verdict: all 6 model IDs in bundles.json treated as PASS, unchanged.

---

## STATUS: Tier 1 + Tier 2 complete, STOP GATE reached (2026-07-15)

All work queue tasks done, one commit each:
- T1 compaction re-injection — verified pre-existing, no change (PASS)
- T2+T3 symmetric suppression + shared commonRules — 122/122 (PASS, commit 56fa26c)
- T2b hotfix excludeKeywords — 123/123 (PASS, commit 174b393)
- T3b normalize model shape — 123/123 (PASS, commit 96036e9)
- T4 verify model IDs — 5/6 confirmed, 1 corrected-slug suggestion rejected as
  unreliable web-search hallucination, no bundles.json change (PASS, commit 64bf6ac)
- GATE (post-Tier-1) — 123/123, tsc clean (commit 5e129be)
- T5 confidence margin in /profile debug — 125/125 (PASS, commit 4a3c7e1)
- T6 telemetry log — 129/129 (PASS, commit 078515d)
- T7 sticky continuation phrases — 133/133, only 1 of 4 phrases was actually new (PASS, commit 4028f43)

Final state: 133/133 tests green, tsc clean, 9 commits on task/optimization-bug-fixes.

Per orchestrator charter: STOP GATE reached. Schema-unification, remaining
excludeKeywords work, and issues #9/#10 require the open charter question
(single-runtime vs vendor-neutral multi-runtime, see above) to be resolved
plus a concrete trigger — not resumed autonomously. Halting for reassessment.

---

## RESOLVED: Charter question — single-runtime OMP (World A)
Decision (2026-07-15): profile-router is a SINGLE-RUNTIME OMP extension.
OpenRouter-format model slugs in bundles.json are the intended, correct form,
NOT a vendor-neutrality violation.
Rationale: bundles.json hardcodes OpenRouter slugs; the extension binds OMP hook
surfaces. The "vendor-neutral, multi-runtime" line is a residual EKC-era
aspiration the implementation abandoned. No translation problem exists, so
vendor-neutrality earns no complexity here.
Consequences:
- #9 capability-descriptor resolver: KILLED. Array model[] fallback is committed.
- Schema-unification: OPTIONAL polish, not required.
- #10 conditional skills: Phase-2, gated on a concrete token-cost trigger.
Supersedes the OPEN charter entry above. Status: RESOLVED.

---

## RESOLVED: T1 — session.compacting handler verdict (VERDICT A, verified 2026-07-15)

Question: does the session.compacting handler do anything, or is it dead code?
The branch carried a FALSIFIED note claiming merged rules ride in `systemPrompt`,
which is re-sent every model call and never compacted. That claim was never
independently verified. It has now been traced against the installed runtime
(@oh-my-pi/pi-agent-core, @oh-my-pi/pi-coding-agent — both ship real src/).

VERDICT A — systemPrompt is never compacted → handler is redundant for its
stated purpose. The FALSIFIED note's claim is CONFIRMED.

Evidence (file:line, installed source):
- pi-agent-core/src/agent-loop.ts:834-837 — inside the agent loop, comment
  "Refresh prompt/tool context from live state before each model call", calls
  config.syncContextBeforeModelCall(currentContext).
- pi-agent-core/src/agent.ts:1150-1156 — that callback does
  `context.systemPrompt = this.#state.systemPrompt` (and tools), i.e. the system
  prompt is re-read from live agent state and resent on EVERY model call.
- pi-agent-core/src/agent-loop.ts:1247,1332 — context.systemPrompt flows into
  llmContext and then into the stream request per call.
- pi-agent-core/src/compaction/compaction.ts:1094-1106 (CompactionPreparation:
  messagesToSummarize / turnPrefixMessages / recentMessages) and :145-155
  (CompactionResult: summary, firstKeptEntryId, tokensBefore, details,
  preserveData) — messages only. systemPrompt is neither an input nor an output
  of compaction.
- pi-agent-core/src/compaction/compaction.ts:855 — the summarizer's own call uses
  `systemPrompt: [SUMMARIZATION_SYSTEM_PROMPT]`; it never reads the agent's live
  system prompt. :889-890 documents the handoff path passing the live system
  prompt "verbatim so providers hit the cached prefix".
=> Rules injected at profile-router.ts:593 (`{ systemPrompt: [...event.systemPrompt, block] }`)
   ride in systemPrompt and cannot be evicted by compaction.

Nuance (why the code comment does not say "no-op"): the handler is redundant but
not literally inert. Its returned `context` is consumed as
pi-coding-agent/src/session/agent-session.ts:12172 (hookContext) →
:9951-9952 / :12807-12808 (extraContext) → compaction.ts:826/1039
(`promptText += formatAdditionalContext(...)`). Per shared-events.ts:344-345 it is
"Additional context lines to include in summary" — it is appended to the
SUMMARIZATION PROMPT, so it can only bias the generated summary toward
rule-relevant detail. It is not, and never was, a systemPrompt re-injection.

Action taken: handler retained, comment above it corrected. The prior comment's
rationale ("so a long agentic run doesn't silently lose the active rules when
older messages get summarized away") is now known-false and was replaced with the
verified rationale + evidence. No behavior change; the 3 existing tests still pass.

---

## RESOLVED: premium.model slug — PASS, live-verified (2026-07-15)

Step 4 check of `premium.model` = ["anthropic/claude-opus-4-8"] (single element,
no fallback, highest-stakes profile). Network egress WAS available, so the slug
was checked against the live OpenRouter API rather than guessed.

Result: PASS — slug resolves. NO CHANGE MADE, no fallback added.

Evidence:
- GET https://openrouter.ai/api/v1/models/anthropic/claude-opus-4-8/endpoints
  → HTTP 200, body `{"data":{"id":"anthropic/claude-opus-4.8", "name":"Anthropic:
  Claude Opus 4.8", ...}}`. OpenRouter accepts the hyphenated form and normalizes
  it to the canonical dotted id.
- Control test (proves the API is not fuzzy-matching):
  `anthropic/claude-opus-9-9` → 404 Not Found;
  `anthropic/totally-fake-model` → 404 Not Found;
  `anthropic/claude-opus-4-7` → resolves to `anthropic/claude-opus-4.7`.
  So hyphen→dot normalization is real and consistent, and non-existent models do
  hard-404. The 200 is therefore meaningful, not a lenient match.
- The public catalog (GET /api/v1/models) lists the canonical id as
  `anthropic/claude-opus-4.8` (dotted). Dotted is canonical for OpenRouter minor
  versions generally: claude-opus-4.1/4.5/4.6/4.7, claude-haiku-4.5,
  claude-sonnet-4.5/4.6. Slugs without a minor version take no dot
  (claude-sonnet-5, claude-fable-5) — both bundles.json slugs are consistent.

This settles the earlier T4 dispute (see "RESOLVED: T4 model ID verification"
above) on evidence rather than reasoning-from-convention:
- The T4 subagent's claim that `anthropic/claude-opus-4-8` is DEAD was FALSE —
  it resolves.
- The orchestrator's decision to reject the proposed change reached the RIGHT
  OUTCOME (no change needed), though its stated rationale (Anthropic's native API
  uses hyphens) is not the reason it works: OpenRouter's canonical slug is in fact
  the DOTTED form, and the hyphenated form only works because OpenRouter
  normalizes it. Both forms are live; the current file needs no edit.
- Optional future polish (NOT done here, not required): switch to the canonical
  dotted `anthropic/claude-opus-4.8` to match OpenRouter's own catalog id and stop
  depending on normalization. Cosmetic only — no behavior change today.
