# 04 — Build Pipeline Audit

## Executive Summary

There is deliberately no build. TypeScript runs in `noEmit` typecheck-only mode; OMP loads the
`.ts` extension directly; tests execute TS natively via `node --experimental-strip-types`. CI is
a single 4-step GitHub Actions job (checkout → Node 22 → `npm install` → `npm run check`) that
finishes in well under a minute. This is appropriate for the project size. Gaps are minor:
`npm install` instead of `npm ci`, single Node version, no schema-vs-validator consistency check
in CI, and `--experimental-strip-types` is a flagged feature whose behavior can shift across
Node releases.

## Details

- `package.json` scripts: `typecheck` (tsc -p), `test` (node --test), `check` (both). No lint,
  no format step — with one source file and a strict tsconfig this is acceptable; adding a
  formatter would churn the file for little gain.
- tsconfig is exemplary for the use case: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `allowImportingTsExtensions`, bundler resolution.
- CI (`.github/workflows/ci.yml`): triggers on push/PR to main only.
  - **BP-1**: `npm install` in CI mutates resolution; `npm ci` gives lockfile-exact,
    reproducible installs and fails on lockfile drift. Low risk, standard practice.
  - **BP-2**: only Node 22 tested. OMP users may run 23/24; `--experimental-strip-types`
    semantics differ by release line. A one-line matrix (22 + latest) would catch drift early.
  - **BP-3**: no artifact/packaging step is needed (install = copy 2 files), but the manual
    install (MANUAL §1) could be scripted (see 08-qol).

## Handoff

```yaml
phase: build-pipeline
status: complete
findings:
  - {id: BP-1, severity: low, confidence: high, summary: "CI uses npm install, not npm ci", files: [.github/workflows/ci.yml]}
  - {id: BP-2, severity: low, confidence: medium, summary: "Single Node version in CI while relying on an experimental Node flag"}
  - {id: BP-3, severity: info, confidence: high, summary: "Install is manual file copy; scriptable"}
```
