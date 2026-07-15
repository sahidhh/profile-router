# T2b: hotfix excludeKeywords — Summary

## Status: COMPLETE

### Field Enforcement Analysis
**excludeKeywords was already implemented and enforced.**

The field exists in:
- Schema: `bundles.schema.json` lines 47-51, defined as `"type": "array"` of strings
- Runtime logic: `profile-router.ts` lines 141-143, in `scoreProfile()` function:
  ```typescript
  for (const kw of profile.excludeKeywords ?? []) {
    if (wordBoundaryTest(text, kw)) return { score: -Infinity, matched: [] };
  }
  ```
- Already used by: `lookup` profile (bundles.json lines 311-318) to exclude broad-scope requests

When any excludeKeywords entry matches (word-boundary test), the profile is immediately disqualified with score = -Infinity, preventing routing.

### Change Applied: bundles.json hotfix profile
Added to hotfix profile (after keywords array, before capabilities):
```json
"excludeKeywords": [
  "schema",
  "secret",
  "migration",
  "invariant",
  "credential"
],
```

### Test Added
**File:** `test/profile-router.test.ts`
**Location:** T01-03: two-axis scoring routing describe block
**Test name:** `"urgent fix for the schema migration" -> premium (hotfix disqualified by excludeKeywords "schema"/"migration")`
**Assertion:** Prompt containing hotfix keywords ("urgent fix") but also excludeKeywords ("schema", "migration") routes to premium (not hotfix), confirming excludeKeywords enforcement disqualifies the profile.

### npm run check Results
- **typecheck:** ✓ Clean
- **tests:** 123/123 pass (was 122; +1 new hotfix excludeKeywords test)
- **suites:** 25
- **duration:** 491.7ms

### Blockers
None. excludeKeywords was already an enforced mechanism; this is a pure data-only configuration addition.
