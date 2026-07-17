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

Deliberately **not** implemented (gates respected): D-F1 skills filtering, D-F2
lookup+investigation co-match fix, `CONTINUATION_PHRASES` removal (owner decision),
toolset restore (needs OMP API verification first).
