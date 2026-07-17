# Implementation Notes

- **Order**: validator hardening first (faba7ba) because its tests establish the
  hostile-config pattern; the one-line help fix was committed separately (602cabc) even though
  it touches the same file — one concern per commit, per repo convention.
- **`loadBundlesWithHash`** replaces the `loadBundles` + `configContentHash` pair. `loadBundles`
  is retained as a thin wrapper so its exported signature (used by tests and six `/profile`
  subcommands) is unchanged. `configContentHash` was private, so its deletion is invisible
  outside the file.
- Behavior-parity decisions in the combined loader:
  - a file that **reads but fails to parse** still returns its hash — the change notice must
    fire when a user saves a broken edit (matches old behavior, now guaranteed from one read);
  - a file that **fails to read** returns `hash: null` (matches old `configContentHash`);
  - warn-once memoization via `warnedPaths` untouched.
- **Shared scoring pass**: a lazy memo (`cachedExplainRows`) inside `before_agent_start`, not a
  module-level cache — the rows are prompt-scoped by definition and must never leak between
  turns. `classify()` still runs its own pass; folding it into the explain rows would have
  changed exported-function contracts for negligible gain (documented in audit 03/RT-2).
- **Telemetry runner-up**: `explain_rows.find((r) => r.name !== chosenProfileName)` — when the
  chosen profile is the top scorer this is exactly the old `explain_rows[1]`, so ordinary
  routes log identically; only pin/sticky routes change (to correct values).
- **Validator**: shape checks now precede `Object.keys`; term-list checks are additive
  (strictly more problems reported, never fewer), keeping the "real bundles.json passes with
  no problems" test meaningful.
