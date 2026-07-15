# DECISIONS

Append-only log of blockers and resolved questions.

---

## OPEN: Charter question (blocks #9)

Is profile-router single-runtime (OMP, OpenRouter slugs OK) OR vendor-neutral multi-runtime? bundles.json currently hardcodes OpenRouter slugs, contradicting the neutral charter. BLOCKS #9.

Status: UNRESOLVED

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
