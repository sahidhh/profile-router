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
