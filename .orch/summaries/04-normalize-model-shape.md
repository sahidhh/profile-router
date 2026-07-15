# T3b: Normalize model shape (string → array for all profiles)

## Summary

Normalized the `model` field across all profiles from an inconsistent mix of strings and arrays to **always arrays**. The `premium` profile was the only profile using a string; all others were already using arrays.

## Changes Made

### 1. bundles.json: Profile model fields

| Profile | Before | After |
|---------|--------|-------|
| default | `["minimax/minimax-m3", "anthropic/claude-sonnet-5"]` | `["minimax/minimax-m3", "anthropic/claude-sonnet-5"]` (unchanged) |
| architecture | `["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-5"]` | `["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-5"]` (unchanged) |
| implementation | `["minimax/minimax-m3", "anthropic/claude-sonnet-5"]` | `["minimax/minimax-m3", "anthropic/claude-sonnet-5"]` (unchanged) |
| review | `["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-5"]` | `["deepseek/deepseek-v4-pro", "anthropic/claude-sonnet-5"]` (unchanged) |
| investigation | `["minimax/minimax-m3", "anthropic/claude-sonnet-5"]` | `["minimax/minimax-m3", "anthropic/claude-sonnet-5"]` (unchanged) |
| premium | `"anthropic/claude-opus-4-8"` | `["anthropic/claude-opus-4-8"]` ✓ **normalized** |
| hotfix | `["deepseek/deepseek-v4-flash"]` | `["deepseek/deepseek-v4-flash"]` (unchanged) |
| lookup | `["google/gemini-2.5-flash-lite"]` | `["google/gemini-2.5-flash-lite"]` (unchanged) |

### 2. bundles.schema.json: Schema changes

**Before (lines 87-92 and 150-155):**
```json
"model": {
  "oneOf": [
    { "type": "string" },
    { "type": "array", "items": { "type": "string" } }
  ]
}
```

**After:**
```json
"model": {
  "type": "array",
  "items": { "type": "string" }
}
```

Changed in two locations: `profile` definition and `partialProfile` definition. Removed the union type; model is now array-only.

### 3. profile-router.ts: Code changes

| File:Line | Change | Reason |
|-----------|--------|--------|
| Line 45 | `model?: string \| string[]` → `model?: string[]` | Profile interface: remove union type |
| Line 65 | `model?: string \| string[]` → `model?: string[]` | MergedConfig interface: remove union type |
| Line 361 | Validation simplified to `Array.isArray(p.model) && p.model.every((m) => typeof m === "string")` | validateBundles: only validate array shape, remove string check |
| Line 489-498 | Removed `const candidates = Array.isArray(next.model) ? next.model : [next.model];` → direct loop `for (const spec of next.model)` | Model resolution: eliminate conditional, always iterate as array |
| Line 523 | `next.model.join(", ")` (was `candidates.join(", ")`) | Error message: use next.model directly |
| Line 527 | `next.model.length > 1 ? "s" : ""` (was `candidates.length > 1 ? "s" : ""`) | Error message: use next.model directly |
| Line 582 | `const modelStr = (m?: string[]) => (m ? m.join(" → ") : "unset")` | Helper function: simplify—no longer branch on Array.isArray |

**Key logic removed:** The conditional `Array.isArray(next.model) ? next.model : [next.model]` that normalized string to single-element array at runtime. This is now guaranteed by the type system and schema validation.

### 4. test/profile-router.test.ts: Test fixture and assertion updates

**Fixture updates (test helper definitions):**
- Line 16: `model: "anthropic/claude-sonnet-5"` → `model: ["anthropic/claude-sonnet-5"]`
- Line 28: `model: "anthropic/claude-haiku-4-5-20251001"` → `model: ["anthropic/claude-haiku-4-5-20251001"]`
- Line 38: `model: "anthropic/claude-opus-4-8"` → `model: ["anthropic/claude-opus-4-8"]`
- Line 47: `model: "anthropic/claude-sonnet-5"` → `model: ["anthropic/claude-sonnet-5"]`
- Line 56: `model: "model-a"` → `model: ["model-a"]`
- Line 62: `model: "model-b"` → `model: ["model-b"]`
- Line 1089: `model: "anthropic/does-not-exist"` → `model: ["anthropic/does-not-exist"]`
- Line 1527: `model: "anthropic/claude-sonnet-5"` → `model: ["anthropic/claude-sonnet-5"]`

**Test assertions (changed from `assert.equal()` to `assert.deepEqual()`):**
- Line 115: `assert.equal(cfg.model, "anthropic/claude-sonnet-5")` → `assert.deepEqual(cfg.model, ["anthropic/claude-sonnet-5"])`
- Line 127: `assert.equal(cfg.model, "anthropic/claude-haiku-4-5-20251001")` → `assert.deepEqual(cfg.model, ["anthropic/claude-haiku-4-5-20251001"])`
- Line 186: `assert.equal(cfg.model, "anthropic/claude-opus-4-8")` → `assert.deepEqual(cfg.model, ["anthropic/claude-opus-4-8"])`
- Line 193: `assert.equal(cfg.model, "model-a")` → `assert.deepEqual(cfg.model, ["model-a"])`
- Line 202: `assert.equal(cfg.model, "anthropic/claude-sonnet-5")` → `assert.deepEqual(cfg.model, ["anthropic/claude-sonnet-5"])`

**Tests affected but not changed (still pass):**
- "notifies naming the profile and bad model string, then degrades silently on repeat" (line 1086–1106): tests single-element array now
- "first unresolvable candidate falls through to the second; no warning fires" (line 1110–1135): already tested multi-element arrays
- "all candidates unresolvable warns exactly once, listing every candidate" (line 1138–1162): already tested multi-element arrays

### 5. Test Results

```
ℹ tests 123
ℹ pass 123
ℹ fail 0
```

All tests pass. No new tests needed—existing array tests cover the functionality. String-specific test (unresolvable single model) now uses a single-element array, which exercises the same code path.

## Verification

- ✓ TypeScript compilation: clean
- ✓ Test suite: 123/123 pass
- ✓ Schema validation: real bundles.json now validates correctly with array-only model type
- ✓ No dead code: all references to the string union type removed

## Impact

**Removed dead code branches:**
- Runtime conditional `Array.isArray(next.model) ? next.model : [next.model]` eliminated—type system now enforces array shape
- Validation logic simplified: no longer branches on "is it a string or array"
- Helper function `modelStr` simplified: always assumes array or undefined

**Benefits:**
- Single code path for model resolution (no branching logic)
- Type-safe: TypeScript compiler prevents string assignment
- Schema enforces array shape at load time
- Clearer mental model: model is always a fallback chain
