# Change Summary — branch `audit/qol-hardening` (2026-07-17)

Five low-risk improvements selected from the full audit (`docs/audit/13-enhancement-
opportunities.md`, E1–E5). Selection criteria applied: low risk, clearly beneficial, no
architectural regression, repo-style consistent, independently testable. Suite grew 139 → 145
tests, all green; typecheck clean after every commit.

| Commit | Change | Audit finding | Why it exists |
|---|---|---|---|
| faba7ba | `validateBundles` crash-proofing | TD-1, TD-2, UX-6 | `/profile validate` crashed on `capabilities: null`, and configs with non-string keyword entries "validated" then crashed `classify()` at routing time |
| 602cabc | `/profile` help lists all 9 subcommands | UX-1 | `stats`, `rules`, `misroute`, `--once` were shipped but invisible at the in-CLI discovery surface |
| 0198cb7 | One disk read + one shared scoring pass per prompt | RT-1, RT-2 | Change-notice hash and applied config could come from two different file states; telemetry and debug trace each re-scored all profiles |
| fc1b6de | Telemetry runner-up excludes chosen profile | TD-3 | Under a manual pin/stickiness the logged runner-up could be the chosen profile itself, polluting the D-F2 gate dataset |
| 053ac92 | Gitignore `.omp/misroutes.jsonl` | SEC-2 | Raw prompt text sat un-ignored next to the committed `bundles.json` |

Deliberately **not** implemented in batch 1 (gates respected at the time): D-F1 skills
filtering, D-F2 lookup+investigation co-match fix, `CONTINUATION_PHRASES` removal (owner
decision), toolset restore (needs OMP API verification first).

---

# Batch 2 — score-lift round (2026-07-17/18, same branch)

Owner explicitly authorized fixing gated/deferred items ("fix anything you can without my
authorization") and supplied a **live production system-prompt sample** showing the D-F2
co-match in the wild. Suite grew 145 → **155 tests, all green**; typecheck clean after every
commit. D-F1 (skills filtering) remains untouched — its `.js` verification was not performed
and nothing in this batch depends on it.

| Commit | Change | Audit finding | Why it exists |
|---|---|---|---|
| c354cc5 | **D-F2 resolved**: breadth nouns leave investigation's scopes; exploration rule normalized to one canonical wording | ARCH-W6, COST-01 | The live sample showed `lookup+investigation` injecting investigation's reproduce/root-cause rules into a cheap lookup, carrying two wordings of the same exploration rule, and silently lifting lookup's sub-agent ban — on a prompt that said "use micro sub-agents". Full decision record: DECISIONS.md Phase 17 |
| e6588cb | Remove unreachable `CONTINUATION_PHRASES` | TD-4 | Every phrase was under the 6-token threshold that already accepts it; behavior-preserving |
| 95b0894 | Telemetry logs default routes; `/profile telemetry` summary | COST-02, QOL-5/6, UX-3 | Default routes are the missing-vocabulary corpus and were the only unlogged routes; the log was write-only |
| 0e7e62b | Baseline toolset restore + `🔒` status marker | ARCH-W2, UX-4, E7 | `pi.getActiveTools()` verified at `dist/types/extensibility/extensions/types.d.ts:734` (API-FINDINGS §g), unblocking the gated fix: restrictions no longer outlive their profile, and are visible while active |
| 3d6f3cd | Persist model-confirm decisions to `.omp/model-decisions.json` | UX-2, QOL-7, E8 | Identical confirm dialogs re-appeared every session; file is gitignored, deleting it re-asks |
| a348a28 | CI: `npm ci` + Node 22/24 matrix | BP-1, BP-2 | Lockfile-exact installs; guard the experimental strip-types flag across release lines |
| 8b73f7d | README/MANUAL docs incl. missing `explain`/`stats` entries, telemetry privacy note, steering-not-enforcement caveat | SEC-1, SEC-3, UX-1 | Docs now match the full command surface and state the enforcement boundary honestly |

**Routing expectation flips (deliberate, doctrine-consistent)**: "what does this repo do" and
the onboard-a-new-hire fixture now route to `lookup` — both previously reached `investigation`
only via the score-2 tie-break on the shared breadth noun, the exact mechanism that carried the
sub-agent-ban leak. All other locked expectations (goldens, reachability, repo-scope escalation
cases) pass unchanged.

**After merging**: run `npm run install:global` so the deployed copy picks up
`profile-router.ts` and `bundles.json` (or `install:global:check` to see the drift first).
