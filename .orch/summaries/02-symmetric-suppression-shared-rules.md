# T2 + T3: symmetric suppression & shared commonRules — summary

## Confirmed root cause (T2)

Verified against current code, not re-diagnosed from scratch:

- `bundles.json` (pre-fix): the four read-only profiles (`architecture`, `review`,
  `investigation`, `lookup`) each declared a plain-string (untagged) "scope"
  statement, e.g. lookup's `"This profile is retrieval and summarisation; edits
  happen in a separate implementation pass."` — literally contradicting a
  co-matched write profile's live edit mandate.
- `profile-router.ts:264-268` (`resolveRules`, pre-fix): `merged.filter((r) => tag
  === undefined || !kill.has(tag))` — untagged entries are *never* filtered, so
  these scope statements always survived merge regardless of what any co-matched
  profile's `suppresses` list contained.
- `bundles.json` (pre-fix): `implementation`, `premium`, `hotfix` (the three
  `capabilities.write === true` profiles) had **no `suppresses` field at all** —
  even if the scope statements had been tagged, nothing on the write side would
  have killed them. Suppression was one-directional: read-only profiles suppress
  write profiles' `implement`/`verify`/`cleanup` tags, but write profiles could not
  suppress anything back.
- Note: `lookup`'s conditional escape-hatch rule (`"If the request exceeds
  read-only scope, state that and stop..."`) was deliberately left untagged and is
  **not** part of this bug — it's guarded/conditional, not a blanket contradiction,
  and a pre-existing golden test (`T06`, line ~563 pre-fix) locks in that it must
  survive co-match. That test still passes unmodified.

## Exact tag/suppresses schema change (T2)

No schema shape change was needed — `RuleEntry = string | {tag, text}` and
`Profile.suppresses?: string[]` already existed (Branch A machinery from an
earlier pass). Fix was data-only, in `bundles.json`:

- New shared tag: `"readonly-scope"`.
- Tagged the one "separate pass" scope statement in each of the four read-only
  profiles with `{tag: "readonly-scope", text: ...}`:
  - `architecture`: "Decide system shape by reading and comparing alternatives; implementation is a separate, later step."
  - `review`: "Review produces severity-tiered findings; a separate pass implements any accepted fix."
  - `investigation`: "Investigation stays in tracing and analysis mode; fixes happen in a separate pass once the cause is confirmed."
  - `lookup`: "This profile is retrieval and summarisation; edits happen in a separate implementation pass."
- Added `"suppresses": ["readonly-scope"]` to the three write profiles:
  `implementation`, `premium`, `hotfix`.
- Did **not** add `"readonly-scope"` to the read-only profiles' own `suppresses`
  lists — `resolveRules`'s kill-set is a union across *all* matched profiles
  including self, so a profile suppressing its own tag would kill its own rule
  even when matched alone (confirmed by an existing test at
  `test/profile-router.test.ts` "a profile's own suppresses does not remove its
  own untagged or unrelated-tag rules").
- `bundles.schema.json`: no change needed for `suppresses`/`ruleEntry` (already
  generic strings/tags).

## Exact commonRules structure + merge order change (T3)

- `profile-router.ts`: `Bundles.default` type widened to
  `Partial<Profile> & { commonRules?: RuleEntry[] }`.
- `bundles.json`: added `default.commonRules: [<the truncation rule, verbatim
  unchanged>]`, and removed that exact string from all 7 profiles' own `rules`
  arrays (previously duplicated 7×).
- `bundles.schema.json`: added `commonRules` to the `partialProfile` definition
  (the `default` block), same shape as `rules` (`$ref: ruleEntry`).
- `merge()` in `profile-router.ts`:
  - No-match fallback path: `resolveRules([bundles.default.rules,
    bundles.default.commonRules], new Set())` — order `default.rules →
    commonRules`.
  - Matched-profile path: `resolveRules([bundles.default?.commonRules,
    ...matches.map(m => m.profile.rules)], kill)` — order `commonRules →
    profileRules`. `resolveRules` already dedups by text (first occurrence
    wins), so commonRules first guarantees a single occurrence even if a profile
    still carried a duplicate.
  - Wording of the truncation rule itself was not touched.

## Tests added (`test/profile-router.test.ts`)

Fixture-based (`describe("merge")`):
1. `"symmetric suppression: co-matched profiles each suppress the other's tagged rule, regardless of order"` — two synthetic profiles with mutual tags/suppresses; asserts both tagged rules vanish on co-match, in both declaration orders.
2. `"symmetric suppression: a profile matched alone still carries its own tagged rule (suppression only fires on co-match)"` — confirms suppression is co-match-only, not self-destructive.
3. `"commonRules: merged in for a single-profile match alongside its own rules, present exactly once"`.
4. `"commonRules: deduped when a profile also happens to declare the same text verbatim"` — guards against future re-duplication.
5. `"commonRules: also merged into the no-match default fallback path, alongside default.rules"`.

Real-`bundles.json`-based (`describe("bundles.json reachability")`):
6. `"T2: readonly-scope tag is symmetric — lookup's scope-statement rule is suppressed when co-matched with a write profile"` — alone it survives, co-matched with `implementation` it's gone, escape-hatch still survives.
7. `"T2: every capabilities.write===true profile declares suppresses including readonly-scope, symmetric with every write:false profile's readonly-scope rule"` — full cross-product check across all real write × readonly-scope profile pairs.
8. `"T3: the truncation rule lives in default.commonRules, not duplicated in any profile's own rules"`.
9. `"T3: every profile's resolved rule set carries the truncation rule exactly once"` — checked for all 7 real profiles, matched alone.

## `npm run check` result

`tsc -p tsconfig.json` — clean, no errors.
`node --experimental-strip-types --test test/*.test.ts` — **122/122 pass, 0 fail**
(113 pre-existing + 9 new). No pre-existing test was modified; all existing
golden/regression tests (including the `lookup` escape-hatch survival golden
test) pass unmodified.

## Blockers

None.
