# T5: Confidence margin (winner − runnerUp) in /profile debug

## Scoring / ranking
- `scoreProfile()` — `profile-router.ts:140-176` — two-axis keyword/verb/scope scoring per profile, `-Infinity` on `excludeKeywords` hit.
- `explain()` — `profile-router.ts:234-245` — scores a prompt against EVERY profile (including score-0 ones), sorted score-desc then declaration-order asc. This is the ranked candidate list that powers the debug trace (docstring above `classify()` at line 232 already calls it out: "Powers the /profile debug trace").
- `classify()` — `profile-router.ts:203-228` — same scoring but filtered to `score >= minScore`, used for the actual routing decision.

## Debug surface
- `formatTraceLines()` — `profile-router.ts:606-624` (closure inside the extension factory) — the single formatter shared by both `/profile debug on|off` (per-prompt trace, wired at line 465-476) and `/profile explain <text>` (on-demand trace, wired at line 681-694). Editing this one function updates both surfaces.

### Exact change
Inside the `else` branch (when at least one profile scored > 0), after the per-profile score lines, added:
```
const winner = scored[0]!;
const runnerUp = scored[1];
const margin = winner.score - (runnerUp ? runnerUp.score : 0);
lines.push(
  runnerUp
    ? `  Δ margin: ${margin} (vs runner-up "${runnerUp.name}")`
    : `  Δ margin: ${margin} (no runner-up — full score)`,
);
```
`scored` is already `rows.filter(r => r.score > 0)` sorted score-desc — `scored[1]` is exactly "the second-highest-scoring profile that was a candidate, even if it didn't ultimately match" (rows come from `explain()`, which scores against ALL profiles, not just those clearing `minScore`).

## No-runner-up representation
When only one profile scores > 0 (all others score 0), `runnerUp` is `undefined`, so `margin = winner.score - 0 = winner.score` — i.e. the margin is displayed as the winner's full score, annotated with `(no runner-up — full score)`. This follows the task's suggested convention and falls out naturally from treating "no positively-scoring runner-up" as an implicit score of 0, consistent with the existing `scored`/`zero` split already in `formatTraceLines`.

## Tests added
New `describe("/profile debug trace: confidence margin", ...)` block in `test/profile-router.test.ts` (inserted before the `session.compacting` describe block, ~line 1251):
1. **Clear winner with runner-up**: winner scores 2 (two keyword hits), runner-up scores 1 (one keyword hit) → asserts `Δ margin: 1` and the runner-up's name is shown.
2. **Only one profile matching (no runner-up)**: one profile scores 1, the other scores 0 → asserts `Δ margin: 1` (the winner's full score) and the `no runner-up` annotation.

Both tests drive the change through the real `/profile explain` command handler (same pattern as existing `/profile explain` and `/profile debug toggle` describe blocks), so they exercise the actual formatter, not a reimplementation.

## `npm run check` result
PASS — 125/125 tests (123 pre-existing + 2 new), 0 failures, tsc clean.

## Blockers
None. The `/profile` debug surface (`formatTraceLines`, shared by `/profile debug` and `/profile explain`) already existed and was the natural, sole place to add this — no new surface had to be invented.
