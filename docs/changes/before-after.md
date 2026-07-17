# Before / After

| Scenario | Before | After |
|---|---|---|
| `/profile validate` on `"capabilities": null` | validator throws `TypeError: Cannot convert undefined or null to object` | reports `"capabilities" must be an object of {read?, write?, execute?: boolean}` |
| `bundles.json` with `keywords: ["ok", 42]` | passes validate; **first prompt crashes** `classify()` with `term.toLowerCase is not a function` | validate reports `"keywords" entries must all be strings`; routing never sees the bad config unwarned |
| `/profile` help text | 5 subcommands listed | all 9 subcommands + `--once` listed |
| Per-prompt config I/O | 2 reads of `bundles.json` (parse + hash) — could observe different file states | 1 read; hash and config guaranteed from the same bytes |
| Per-prompt scoring (telemetry on + debug on) | 3 full profile-table scoring passes | 2 (classify + one shared explain) |
| Telemetry row when a pinned profile is outranked | `runnerUpProfile` could equal the chosen profile; margin misleading (e.g. 0) | runner-up = actual top competitor; margin negative, e.g. `-2` |
| `git add .omp` after using `/profile misroute` | stages `misroutes.jsonl` (raw prompt text) | file is ignored |

Unchanged (verified by the untouched 139-test suite passing): routing decisions, merge
semantics, rules injection, model confirm flow, change-notice UX, all existing telemetry rows
for ordinary (non-pinned) routes.
