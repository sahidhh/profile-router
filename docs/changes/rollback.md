# Rollback

Every change is a small, independent commit on `audit/qol-hardening`; each can be reverted
alone with `git revert <sha>` (no commit depends on another's code):

| SHA | Change | Revert consequence |
|---|---|---|
| faba7ba | validator hardening | restores the `capabilities: null` crash and validate-passes-but-classify-crashes gap; also remove its 5 tests or they fail |
| 602cabc | help string | help text loses 4 subcommands again; no functional effect |
| 0198cb7 | single read + shared pass | restores double read / extra scoring passes; requires `configContentHash` back — revert cleanly via git, do not hand-edit |
| fc1b6de | telemetry runner-up | restores `explain_rows[1]` behavior; its regression test will fail and must be reverted with it |
| 053ac92 | gitignore | `.omp/misroutes.jsonl` becomes stageable again |

Full rollback: `git revert 053ac92 fc1b6de 0198cb7 602cabc faba7ba` (or simply don't merge the
branch — `main` is untouched). If the branch was installed globally, re-run
`npm run install:global` from `main` afterward to restore the deployed copy.

No data migrations, no persisted-state format changes — rollback has no cleanup steps.
