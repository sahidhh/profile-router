# T7: extend isStickyContinuation() PHRASES ONLY

## Function location and list shape
`isStickyContinuation()` — `profile-router.ts:196-201`.
Backing data — `CONTINUATION_PHRASES`, a plain `Set<string>` literal — `profile-router.ts:182-195` (originally 182-194).

Shape confirmed as a simple phrase-set exact-match check:
```ts
function isStickyContinuation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  const tokenCount = trimmed.split(/\s+/).length;
  return tokenCount < 6 || CONTINUATION_PHRASES.has(trimmed);
}
```
`text` is pre-lowercased by the caller (`classify()` does `prompt.toLowerCase()` before calling this), so the Set entries are lowercase and matched via exact `Set.has()` equality (no regex, no substring, no fuzzy matching). No refactor needed — pure data addition confirmed safe.

## Phrases: new vs already present
- `"continue"` — already present (line 186 pre-edit).
- `"go on"` — already present (line 185 pre-edit).
- `"next"` — already present (line 187 pre-edit).
- `"now fix it"` — **new**, added.

Only 1 of the 4 requested phrases was actually missing from the list; the other 3 were no-ops (skipped to avoid duplicates), per task instructions.

## Exact diff
```diff
   "go on",
   "continue",
   "next",
   "and",
   "more",
   "keep going",
   "do it",
   "proceed",
   "thanks",
+  "now fix it",
 ]);
```

## Tests added
`test/profile-router.test.ts`, inside `describe("T01-03: two-axis scoring routing")`, immediately after the existing `stickiness: short/continuation follow-ups inherit the previous turn's profile` test (previously ending ~line 1764). Added 4 new tests, one per requested phrase, following the exact pattern of the existing stickiness test (classify a first prompt into "investigation", then classify the phrase as turn 2 with `prevProfileName`, assert profile inherited and `inherited === true`):

- `stickiness: "continue" triggers sticky continuation`
- `stickiness: "now fix it" triggers sticky continuation`
- `stickiness: "go on" triggers sticky continuation`
- `stickiness: "next" triggers sticky continuation`

## npm run check result
PASS — `tsc -p tsconfig.json` clean, then `npm test`: **133/133 tests pass** (129 prior + 4 new), 0 fail, 0 cancelled.

## Blocked
Not blocked. Function existed, matched the expected simple `Set<string>` phrase-list shape exactly, and the change was a pure data addition (1 new entry; 3 requested phrases were pre-existing duplicates, correctly skipped).
