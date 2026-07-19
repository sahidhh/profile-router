# OMP version-bump report (`@oh-my-pi/pi-coding-agent`)

> Status doc — **to be worked on later**. Captures the bump ritual, the exact API anchors this
> extension depends on, and what to re-verify. Not an instruction to bump now.

## 1. Current state (as of 2026-07-19)

| | Version | Notes |
|---|---|---|
| Pinned (`package.json:26`) | **16.4.1** | exact pin, not a range — deliberate |
| Installed (`node_modules`) | 16.4.1 | matches pin |
| Latest published (`npm view … version`) | **17.0.5** | published 2026-07-18 |

**The gap is a major-version jump (16 → 17).** Under semver, treat every API this extension
touches as potentially changed until re-verified against 17.x source. Do **not** assume a clean
bump. This is exactly the case the exact pin exists to guard against.

## 2. Why the pin is exact (context for whoever bumps)

The README and MANUAL state the pin is exact "due to upstream release cadence; bumping it is a
manual, deliberate action." The extension calls a fair amount of the extensibility surface
(events, model/thinking/tools control, command registration), and OMP ships full TypeScript
source under `src/` — so the extension's correctness is verified against *behavior*, not just
`.d.ts`. A silent range bump could shift that behavior under us. The bump is therefore a
reviewed change with its own verification pass, never automatic.

## 3. The bump ritual (three phases)

1. **Bump** — set the exact new version in `package.json`, `npm install`, confirm
   `node_modules/@oh-my-pi/pi-coding-agent/package.json` version matches.
2. **Re-verify API-FINDINGS anchors** — walk §4 below. Every anchor that moved or changed shape
   is a finding: update `API-FINDINGS.md` file:line references and, if behavior changed, the
   extension code. Read the upstream `CHANGELOG.md` (shipped in the package) and 17.x release
   notes for breaking-change callouts first — it narrows the search.
3. **`npm run check`** — strict typecheck (compiles against `dist/types/…`) + full 155-test
   suite. Green is necessary but **not sufficient** for a major bump: typecheck only catches
   `.d.ts`-level breaks, not behavioral ones (e.g. an event still firing but with different
   array composition — see the D-F1 finding, §5).

## 4. Re-verification checklist — the API surface this extension depends on

Each item: confirm it still exists with the same name/shape/behavior in 17.x, then update the
cited anchor in `API-FINDINGS.md`. Grouped by API-FINDINGS section.

**(a) Import + module shape** — `API-FINDINGS.md` §(a)
- [ ] `import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent"` still resolves at package
      root (`dist/types/index.d.ts` re-export).
- [ ] Module shape: `export default function (pi: ExtensionAPI)` (`extensions/loader.ts:45-50`).
- [ ] Discovery paths unchanged: project `<cwd>/.omp/extensions/*.ts`, global
      `~/.omp/agent/extensions/*.ts` (`discovery/builtin.ts:473`, `pi-utils/src/dirs.ts`).

**(b) `before_agent_start`** — `API-FINDINGS.md` §(b)  *(highest-risk surface)*
- [ ] Event still named `before_agent_start`; payload still carries `prompt` and
      `systemPrompt: string[]` (`extensions/types.ts:560-565`).
- [ ] Handler return `{ systemPrompt: string[] }` still replaces the prompt array
      (`agent-session.ts:7838-7841`).
- [ ] `systemPrompt[]` element composition still `[rendered, projectPrompt, activeRepoContext?]`
      (`system-prompt.ts:789-803`) — relevant to rules injection AND the D-F1 reopener (§5).

**(c) Model / thinking / tools control** — `API-FINDINGS.md` §(c)
- [ ] `ctx.models` resolve query (`extensions/model-api.ts:20-39`); `pi.setModel(...)` returns
      credential-ok boolean (`loader.ts:243-245`); `ctx.model: Model | undefined`.
- [ ] `pi.setThinkingLevel(...)` (`extensions/types.ts:1157-1158`) + accepted level strings
      (`pi-agent-core/src/thinking.ts:8-19`).
- [ ] `pi.setActiveTools(string[])` (`extensions/types.ts:1146`, `loader.ts:235-237`).

**(d) Subagent block in `tool_call`** — `API-FINDINGS.md` §(d)
- [ ] `tool_call` event; task tool `name === "task"` (`task/index.ts:453`); `input.agent`
      defaulted to `"task"` (`task/types.ts`); result `{ block, reason }`
      (`shared-events.ts:286-291`).

**(e) Command + UI + logging** — `API-FINDINGS.md` §(e)
- [ ] `pi.registerCommand(name, { description, handler })` — and the `handler(args, ctx)`
      signature the dispatch table types against
      (`Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1]`).
- [ ] `ctx.ui.notify / confirm / setStatus`, `ctx.cwd`, debug logger surface.

**(f) `session.compacting`** — `API-FINDINGS.md` §(f)
- [ ] Event + handler return `{ context: string[] }` (`shared-events.ts:342-350`,
      `dist/types/.../shared-events.d.ts:276-284`).

**(g) Toolset enumeration** — `API-FINDINGS.md` §(g)
- [ ] `pi.getActiveTools()` / `pi.getAllTools()` (`extensions/types.d.ts:734-736`) — already
      feature-guarded with `typeof … === "function"`, so absence degrades gracefully, but
      confirm the names/semantics for the baseline-restore feature.

## 5. Gated-feature reopeners to check on this bump

A 17.x bump is the natural time to re-check whether previously-blocked work became feasible.

- **D-F1 (skills filtering)** — CLOSED as not-feasible on 16.4.1 because `<skills>` is embedded
  in `systemPrompt[0]`, not its own element, and there is no skills-restriction API
  (`API-FINDINGS.md` §(h), `DECISIONS.md` Phase 18). **Re-open D-F1 only if 17.x either** (a)
  splits `<skills>` into a distinct `systemPrompt[]` element, or (b) adds a `setActiveSkills` /
  skills-restriction method to `ExtensionAPI`. Check `system-prompt.ts` array assembly and grep
  the 17.x type surface for `skill`.
- **`resources_discover`** — currently additive-only (`skillPaths`, session-scoped). Confirm it
  hasn't gained per-prompt / subtractive semantics.

## 6. Risk assessment for 16.4.1 → 17.0.5

- **Major bump ⇒ assume breaking.** Prioritize §4(b) (`before_agent_start` payload/return) and
  §4(c) (model/thinking/tools methods) — these are where a rename or signature change would
  silently defeat routing while still typechecking if the shapes happen to stay structurally
  compatible.
- **Behavioral, not just type, verification.** For §4(b) and §4(f), a green typecheck does not
  prove the event still fires with the same data. Consider a scratch smoke run (install into a
  throwaway `.omp/`, send one prompt per profile keyword, observe status line + model switch)
  before trusting the bump.
- **Full source is shipped**, so every anchor above is greppable in `node_modules/.../src` — the
  re-verification is mechanical, just not skippable.

## 7. Rollback

The bump is a single reviewed commit touching `package.json` (+ `package-lock.json`, and any
`API-FINDINGS.md`/code follow-ups). If verification fails and can't be resolved quickly, revert
that commit and `npm install` to restore 16.4.1. Nothing in the extension persists cross-version
state that a downgrade would corrupt (config is re-read per prompt; `.omp/model-decisions.json`
is keyed by from→to model pair and is bump-agnostic).

## 8. Quick command sequence (when the work is scheduled)

```sh
npm view @oh-my-pi/pi-coding-agent version              # confirm current latest
# edit package.json → exact target version
npm install
node -e "console.log(require('@oh-my-pi/pi-coding-agent/package.json').version)"  # sanity
# read upstream CHANGELOG.md + 17.x notes; walk §4 checklist against node_modules/.../src
npm run check                                           # typecheck + 155 tests
# optional: throwaway .omp smoke run per §6
# update API-FINDINGS.md anchors; log the bump + any breaks in DECISIONS.md
```
