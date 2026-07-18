# Technical Details

## faba7ba — validateBundles hardening (`profile-router.ts`)

- `capabilities` branch: `typeof c !== "object" || c === null || Array.isArray(c)` is checked
  **before** `Object.keys` (previously `Object.keys(null)` threw a TypeError out of the
  validator; arrays like `[true]` were also mis-accepted into key enumeration).
- New `termFields` loop over `keywords`/`verbs`/`scopes`/`excludeKeywords`:
  - non-array `verbs`/`scopes`/`excludeKeywords` → `"<field>" must be an array of strings`
    (a non-array here crashed `classify()` via `.map` on a non-array);
  - any non-string entry → `"<field>" entries must all be strings` (a non-string crashed
    `classify()` via `term.toLowerCase()` / `term.length` in the sort);
  - `keywords`' non-array case defers to the pre-existing "non-empty array" problem line to
    avoid double-reporting.
- `minScore` must be a number when present (a string `"3"` silently mis-thresholded via `>=`
  string coercion).

## 602cabc — help string (`profile-router.ts`)

Old: `/profile [<name>|clear] | list | debug [on|off] | validate | explain <text>`
New adds: `--once` form, `stats`, `rules`, `misroute [expected]`.

## 0198cb7 — single read + shared pass (`profile-router.ts`)

- `loadBundlesWithHash(cwd, notify) → { bundles, hash }`: one `readFileSync`, hash =
  sha256(raw).slice(0,12) computed before `JSON.parse`, then the same structural check and
  fail-open path as before. `loadBundles` = `loadBundlesWithHash(...).bundles`.
- `configContentHash` deleted (was private).
- Hook: `const { bundles, hash: currentHash } = loadBundlesWithHash(...)`; change-notice logic
  unchanged. `explainRows()` lazy memo feeds both the telemetry call and the debug trace.
- Scoring passes per prompt: worst case 3 → 2 (classify + at most one shared explain);
  disk reads 2 → 1.

## fc1b6de — telemetry runner-up (`profile-router.ts`, tests)

`runnerUpRow = explain_rows.find((r) => r.name !== chosenProfileName)` (rows are sorted
score-desc/declaration-order by `explain()`, so `find` yields the best *other* profile).
Margin can now be negative — by design, it records "the pin was outranked by N".
New regression test drives a pinned low-scorer against a high-scoring prompt and asserts
`runnerUpProfile: "loud"`, `margin: -2`.

## 053ac92 — `.gitignore`

Appends `.omp/misroutes.jsonl` with a comment explaining why (prompt text adjacent to the
committed `bundles.json`). `.profile-router-telemetry.log` needed no entry — already matched
by the existing `*.log` rule (verified with `git check-ignore`).
