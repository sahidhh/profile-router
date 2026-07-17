# Migration Notes

**No migration required.** No schema changes, no config changes, no API-signature changes.

- `bundles.json` / `bundles.schema.json`: untouched. Existing configs behave identically.
- Exported functions: `loadBundles` signature unchanged; new export `loadBundlesWithHash`
  (additive). Private `configContentHash` removed — not reachable by consumers.
- **Validator strictness**: configs that previously *passed* `/profile validate` but crashed at
  routing time (non-string term entries, non-array term fields, non-numeric `minScore`,
  `capabilities: null`) now report problems. This is the intended fix; no well-formed config is
  newly rejected (locked by the "real bundles.json passes with no problems" test).
- **Telemetry consumers**: rows for ordinary routes are byte-identical in meaning. Rows written
  during a manual pin or sticky inheritance now carry the true competitor and may have a
  negative `margin`. Any downstream analysis (the D-F2 gate review) should treat pre-fix
  pinned/sticky rows as suspect; ordinary rows from before the fix remain valid.
- **Installed copies**: the global install is a copy — run `npm run install:global` (or
  `install:global:check` to see drift) after merging.
