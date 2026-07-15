# Model ID Verification Report (2026-07-15)

Verification of 6 model identifiers against live provider APIs/catalogs.

## Verification Results

### 1. `minimax/minimax-m3`
**Verdict: PASS**  
**Source:** [OpenRouter MiniMax M3](https://openrouter.ai/minimax/minimax-m3)  
**Notes:** Multimodal foundation model; 1M-token context window; confirmed live on OpenRouter.

### 2. `deepseek/deepseek-v4-pro`
**Verdict: PASS**  
**Source:** [OpenRouter DeepSeek V4 Pro](https://openrouter.ai/deepseek/deepseek-v4-pro)  
**Notes:** Large MoE model (1.6T params, 49B activated); 1M-token context; confirmed live on OpenRouter.

### 3. `deepseek/deepseek-v4-flash`
**Verdict: PASS**  
**Source:** [OpenRouter DeepSeek V4 Flash](https://openrouter.ai/deepseek/deepseek-v4-flash)  
**Notes:** Efficiency-optimized MoE model (284B params, 13B activated); 1M-token context; confirmed live on OpenRouter.

### 4. `google/gemini-2.5-flash-lite`
**Verdict: PASS**  
**Source:** [OpenRouter Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite)  
**Notes:** Lightweight reasoning model; ultra-low latency; confirmed live on OpenRouter.

### 5. `anthropic/claude-sonnet-5`
**Verdict: PASS**  
**Source:** [OpenRouter Claude Sonnet 5](https://openrouter.ai/docs/cookbook/evaluate-and-optimize/model-migrations/sonnet-5), [LLM Reference](https://www.llmreference.com/provider/openrouter/claude-sonnet-5)  
**Notes:** Released 2026-06-30; 1M-token context, 128K max output; confirmed live on OpenRouter.

### 6. `anthropic/claude-opus-4-8`
**Verdict: DEAD** (incorrect format)  
**Correct Model ID:** `anthropic/claude-opus-4.8`  
**Source:** [OpenRouter Claude Opus 4.8](https://openrouter.ai/anthropic/claude-opus-4.8)  
**Notes:** Requested ID uses hyphens `4-8`, but live model ID uses a dot `4.8`. Model itself is live and current; only the identifier format is incorrect.

## Summary

- **Overall Verdict:** BLOCKED
- **Pass Count:** 5 of 6
- **Dead/Incorrect:** 1
- **Corrected Slugs:** `anthropic/claude-opus-4-8` → `anthropic/claude-opus-4.8`

All 6 models exist and are available through OpenRouter or their respective vendor APIs. Only one identifier requires correction (dot vs. hyphen in version number).
