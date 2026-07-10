# SALVAGE.md — ai-dev-platform Recon Output

---

## 1. Verdict Table

| Target | Status | Path(s) |
|---|---|---|
| `bundles.json` or profile/bundle config file | **PRESENT (partial match)** | `05-runtimes/opencode/agents.template.json` maps profiles to agents/models; `03-profiles/EP-*.md` are the authoritative profile definitions. No file literally named `bundles.json`. |
| `promptbuilder.py` or prompt-classification / profile-merging code | **ABSENT** | No Python code exists in this repo. Routing is a markdown decision table, not executable code. |
| Keyword → task-type mapping | **PRESENT** | `04-routing/routing-rules.md` §2 (12-row priority table). Copied verbatim into `05-runtimes/claude/CLAUDE.md.template` and `05-runtimes/opencode/rules.template.md`. |

---

## 2. Inventory Table

| File | What it is | Rating |
|---|---|---|
| `README.md` | Entry point and orientation | REUSE |
| `Architecture.md` | Platform layer model, design decisions, folder descriptions | REUSE |
| `00-research/README.md` | Placeholder; actual R1–R4 reports not committed | DEAD |
| `01-core/README.md` | Index stub | REUSE |
| `01-core/specification.md` | **Primary source of truth**: philosophy, global rules (GR1–14), guardrails (GD1–3), anti-patterns, skill catalog (S1–8), Execution Profiles (EP-*), project metadata schema, precedence model | REUSE |
| `02-skills/README.md` | Index | REUSE |
| `02-skills/S1-investigation-doc-generator.md` | Skill contract: investigation doc before code change | REUSE |
| `02-skills/S2-adr-writer.md` | Skill contract: ADR with rejected alternatives | REUSE |
| `02-skills/S3-merge-readiness-checklist-runner.md` | Skill contract: 6-gate merge checklist | REUSE |
| `02-skills/S4-post-fix-verification.md` | Skill contract: reproducible evidence of finding resolution | REUSE |
| `02-skills/S5-severity-tiered-finding-ledger.md` | Skill contract: append-only finding ledger | REUSE |
| `02-skills/S6-phase-plan-scaffold.md` | Skill contract: phase plan with exclusion list + deploy checklist | REUSE |
| `02-skills/S7-stack-specific-anti-pattern-scan.md` | Skill contract: stack guardrail grep scan | REUSE |
| `02-skills/S8-hot-path-change-checklist.md` | Skill contract: pre-edit checklist for high-blast-radius files | REUSE |
| `03-profiles/README.md` | Index | REUSE |
| `03-profiles/EP-Architecture.md` | Profile: decide system shape; S2; T2; read-only tools | REUSE |
| `03-profiles/EP-Documentation.md` | Profile: write durable artifacts; S1/S2/S6; T3; doc files only | REUSE |
| `03-profiles/EP-FastCheap.md` | Profile: Operator hotfix; S8; T4; build-check only | REUSE |
| `03-profiles/EP-Implementation.md` | Profile: build to settled spec; GR3/8/14; T3; read+write | REUSE |
| `03-profiles/EP-Investigation.md` | Profile: root cause without code change; S1; T2; read-only | REUSE |
| `03-profiles/EP-Premium.md` | Profile: max correctness; S1+S2+S4+S5+EP-Review chain; T1 | REUSE |
| `03-profiles/EP-Review.md` | Profile: multi-pass audit; S3/S4/S5; T2; no code edits | REUSE |
| `04-routing/README.md` | Index | REUSE |
| `04-routing/context-budgets.md` | 6 budget levels (Widest→Minimal) with scope/loading/expansion policy per profile | REUSE |
| `04-routing/escalation-rules.md` | Hard escalation (HE-01–06), soft escalation (SE-01–06), in-flight escalation rules | REUSE |
| `04-routing/fallback-rules.md` | No-match fallback, tier-unavailable fallback, de-escalation rules | REUSE |
| `04-routing/model-tiers.md` | T1–T4 capability/cost intent definitions and safety floors | REUSE |
| `04-routing/reasoning-depth.md` | RD-Maximum/High/Medium/Low deliberation intent per profile | REUSE |
| `04-routing/routing-policy.md` | 8 routing principles (RP-01–08) | REUSE |
| `04-routing/routing-rules.md` | **12-row keyword→profile routing table** with signals, file-path patterns, multi-signal resolution | REUSE |
| `05-runtimes/README.md` | Index | REUSE |
| `05-runtimes/_shared/guardrails-snippet.md` | GD1–GD3 in copy-paste prose with enforcement behavior | REUSE |
| `05-runtimes/_shared/global-rules-snippet.md` | GR1–GR14 condensed with runtime implication per rule | REUSE |
| `05-runtimes/_shared/language-rules/angular-frontend.md` | Angular rules (architecture, hot-path, guardrails, merge gate greps) | REUSE |
| `05-runtimes/_shared/language-rules/dotnet-cqrs.md` | .NET/CQRS rules (architecture, data access, guardrails, merge gate greps) | REUSE |
| `05-runtimes/_shared/language-rules/python-fastapi.md` | Python/FastAPI rules (architecture, types, guardrails, merge gate greps) | REUSE |
| `05-runtimes/_shared/language-rules/sql-database.md` | SQL/DB rules (schema design, migrations, queries, debugging idiom, guardrails) | REUSE |
| `05-runtimes/_shared/language-rules/typescript-nextjs.md` | TypeScript/Next.js rules (architecture, data access, types, guardrails, merge gate greps) | REUSE |
| `05-runtimes/claude/CLAUDE.md.template` | **Complete Claude Code system-prompt template**: guardrails, global rules, stack rules, project metadata, routing table, skill slash-commands, profile slash-commands | REUSE |
| `05-runtimes/claude/README.md` | Claude adapter conformance notes | REUSE |
| `05-runtimes/claude/commands/S1-investigation.md` through `S8-hot-path-check.md` | 8 Claude slash-command definitions (one per skill) | REUSE |
| `05-runtimes/claude/commands/profiles/EP-*.md` | 7 Claude slash-command definitions (one per profile) | REUSE |
| `05-runtimes/claude/settings.template.json` | Claude Code settings template (permissions, model defaults) | REUSE |
| `05-runtimes/future/README.md` | Placeholder for unbuilt runtimes | DEAD |
| `05-runtimes/opencode/README.md` | OpenCode adapter conformance notes | REUSE |
| `05-runtimes/opencode/agents.template.json` | **Complete OpenCode agent config**: tier→model mapping (T1→Opus-4-8, T2/T3→Sonnet-4-6, T4→Haiku-4-5), all 15 agents (7 profiles + 8 skills) with full prompt instructions and GD2 deny-list | REUSE |
| `05-runtimes/opencode/openrouter.template.json` | OpenRouter variant of agents.template.json | REUSE |
| `05-runtimes/opencode/rules.template.md` | Complete OpenCode rules file template (same content as CLAUDE.md.template, OpenCode idiom) | REUSE |
| `05-runtimes/runtime-contract.md` | Full adapter interface spec: 15 required capabilities, 6 optional capabilities, 10 prohibited behaviors, lifecycle, hooks, session management, extensibility | REUSE |
| `06-bootstrap/README.md` | Index | REUSE |
| `06-bootstrap/new-machine.md` | New-machine setup guide | REUSE |
| `07-project-templates/README.md` | Index | REUSE |
| `07-project-templates/angular.yaml` | Layer 2 project metadata template (Angular stack) | REUSE |
| `07-project-templates/dotnet-cqrs.yaml` | Layer 2 project metadata template (.NET/CQRS) | REUSE |
| `07-project-templates/python-fastapi.yaml` | Layer 2 project metadata template (Python/FastAPI) | REUSE |
| `07-project-templates/react-nextjs.yaml` | Layer 2 project metadata template (React/Next.js) | REUSE |
| `07-project-templates/sql-database.yaml` | Layer 2 project metadata template (SQL/DB) | REUSE |
| `docs/EXPLAINER.md` | Platform explainer for external readers | REUSE |
| `docs/OPENCODE-GUIDE.md` | OpenCode usage guide | REUSE |
| `docs/README.md` | Index | REUSE |
| `docs/breaking-changes.md` | v1→v2 breaking change record (Modes→Profiles rename) | MINE |
| `docs/implementation-plan.md` | Phased rollout plan with phase descriptions and sequencing | MINE |
| `docs/migration-notes.md` | v1→v2 migration guide with field renames and behavioral changes | MINE |
| `languages/README.md` | Index | REUSE |
| `languages/angular/rules.md` | Angular language pack (canonical version) | REUSE |
| `languages/dotnet/rules.md` | .NET language pack (canonical version) | REUSE |
| `languages/python/rules.md` | Python language pack (canonical version) | REUSE |
| `languages/react/rules.md` | React/TypeScript language pack (canonical version) | REUSE |
| `languages/sql/rules.md` | SQL/DB language pack (canonical version) | REUSE |

---

## 3. Salvage Extraction

### 3.1 Engineering Rules / Guardrails / Standards

#### Architecture

| Rule | Statement | Source |
|---|---|---|
| GR1 | Layer/boundary separation is enforced; violations are checked before merge. | `01-core/specification.md` §5 |
| GR2 | The repository pattern is the only sanctioned data-access abstraction; no ORM usage leaks past it. | `01-core/specification.md` §5 |
| GR3 | Business logic lives in pure, independently testable functions. Concrete dependencies are wired only at the composition root. | `01-core/specification.md` §5 |
| GR4 | Invariants that must never break are encoded in the database, not the application. | `01-core/specification.md` §5 |
| GR5 | Migrations are forward-only. History is corrected by revert, never by rewrite. Refuse to edit an already-committed migration file. | `01-core/specification.md` §5 |
| GR10 | Prefer the framework's native facility over a custom abstraction; delete any abstraction that carries no contract value once identified. | `01-core/specification.md` §5 |
| GR14 | Derived data is recomputed at read time rather than persisted, whenever that is reversible and cheap. | `01-core/specification.md` §5 |
| P1 | Enforce architecture at boundaries; stay pragmatic inside them. Layering is non-negotiable; over-engineering within a layer is not rewarded. | `01-core/specification.md` §3 |
| P2 | Abstractions must earn their place. A second consumer justifies extraction; a contract-free wrapper around a single implementation does not justify existing. | `01-core/specification.md` §3 |
| P3 | The database is the source of truth and the last line of defense. Invariants that must never break are encoded as schema constraints, not application logic. | `01-core/specification.md` §3 |

**Stack-specific architecture rules (canonical source: `languages/<stack>/rules.md`):**

- TS-A1: Feature-first folder structure; code is co-located by domain concern, not by file type.
- TS-A2: No cross-feature imports; features import from shared libraries only.
- TS-A3: Server components and client components are distinct roles; data-fetching and auth live in server components; interactivity in client components.
- DN-A1: Clean Architecture layer order: Domain → Application → Infrastructure → API/Host. No inner layer may import an outer layer.
- DN-A2: CQRS split is strict: Commands mutate, Queries read. A handler may not do both.
- DN-A3: Handlers are the only entry points for use-case logic. Controllers are thin.
- PY-A1: Strict layer order: `api` → `usecase` → `domain` → `worker` → `adapter` → `db`.
- PY-A2: FastAPI route handlers are thin: validate HTTP, call use-case, return response. No business logic in handlers.
- AN-A2: HTTP calls go through `ApiService`/`ApiEndpoints`. No component calls `HttpClient` directly.
- AN-H1: Drop to raw DOM/canvas for hot-path rendering; abstraction layers are for data/service logic.
- SQL-S1: Invariants are expressed as database constraints (`NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY`). Application-layer validation is a UX convenience, not the enforcement point.
- SQL-S2: Identity tuples are backed by unique indexes, not application-level uniqueness checks.
- SQL-S3: Single-active flags enforced by partial unique index or trigger, not by application code.

#### Testing

| Rule | Statement | Source |
|---|---|---|
| GR8 | A change is not handed off until the build/test toolchain reports clean. This is the universal done-signal regardless of stack. | `01-core/specification.md` §5 |
| GR6 | A fix is not approved until its root cause is identified; symptom patches are rejected. | `01-core/specification.md` §5 |

#### Security

| Rule | Statement | Source |
|---|---|---|
| GD1 | Credentials, secrets, API keys, tokens, connection strings, and passwords never enter source control or client-exposed environment config. They live only in CI secret stores, environment variables outside source control, or secret-management services. | `05-runtimes/_shared/guardrails-snippet.md` |
| GD1 note | GD1 requires active, automated secret-scanning in the merge gate — it cannot be assumed to self-enforce. | `01-core/specification.md` §10 |
| TS-G4 | Environment variables that are secret or server-only are never prefixed `NEXT_PUBLIC_`. Misconfiguration is a GD1 violation. | `languages/react/rules.md` |
| DN-G5 | Credentials and connection strings are never in `appsettings.json` committed to source control. | `languages/dotnet/rules.md` |
| PY-G4 | Secrets and credentials are never hardcoded or committed. Loaded from environment variables via `pydantic-settings` at startup. | `languages/python/rules.md` |
| SQL-G2 | Connection strings and database credentials are never committed to source control. | `languages/sql/rules.md` |

#### Code Quality

| Rule | Statement | Source |
|---|---|---|
| GR9 | Investigation is search-first and read-restrained: locate via symbol/grep search before opening files; avoid bulk reads. | `01-core/specification.md` §5 |
| GR13 | Tooling favors a cheap deterministic gate before an expensive model call; context is scoped, not bulk-loaded. | `01-core/specification.md` §5 |
| AP1 | Hollow abstractions (one implementation, no contract value) are rejected. | `01-core/specification.md` §11 |
| AP2 | Preemptive shared-utility extraction before a second consumer exists is rejected. | `01-core/specification.md` §11 |
| AP3 | ORM abstractions layered beyond a repository interface are rejected. | `01-core/specification.md` §11 |
| AP4 | Heavy inheritance chains, generic "Processor" classes, decorators used for control flow are rejected. | `01-core/specification.md` §11 |
| AP5 | Comments that restate what well-named code already says are rejected. | `01-core/specification.md` §11 |
| AP6 | Symptom patching without identifying root cause is rejected. | `01-core/specification.md` §11 |
| AP7 | Hardcoded catalogs where the database should be the source of truth are rejected. | `01-core/specification.md` §11 |
| TS-G1 | `any` and `as any` are banned. The merge gate runs grep and fails on any match outside suppressions with an explanatory comment. | `languages/react/rules.md` |
| DN-G1 | `using Microsoft.EntityFrameworkCore` is banned from the Application layer. | `languages/dotnet/rules.md` |
| DN-G2 | Every `async` method in Application and Infrastructure layers must accept a `CancellationToken` and pass it to every awaitable call. | `languages/dotnet/rules.md` |
| DN-G3 | No new logging abstraction. Use `ILogger<T>` only. No wrapper class or additional interface. | `languages/dotnet/rules.md` |
| PY-G1 | Hardcoded catalogs (fixed lists of domain values) are rejected. They live in the database. | `languages/python/rules.md` |
| PY-G2 | No `Any` type annotation in domain, use-case, or adapter layers. | `languages/python/rules.md` |
| PY-G3 | No sync blocking calls in async route handlers without explicit thread-pool delegation. | `languages/python/rules.md` |
| AN-G1 | Never edit a production environment config file without deliberate prod-deploy intent, confirmed in commit message and PR description. | `languages/angular/rules.md` |
| AN-G3 | No direct `HttpClient` injection into components. | `languages/angular/rules.md` |
| AN-G4 | API endpoint URLs never hardcoded as string literals; all paths go through `ApiEndpoints`. | `languages/angular/rules.md` |
| SQL-G1 | Hardcoded domain catalogs are rejected; each is a migration away from a reference table. | `languages/sql/rules.md` |
| SQL-G3 | No migration file may be edited after it has been committed. | `languages/sql/rules.md` |
| SQL-G4 | An invariant enforced only in application code must be marked `⚠ unenforced-invariant` and scheduled for a follow-up migration. | `languages/sql/rules.md` |
| SQL-Q1 | Filter in the database, not in application memory. | `languages/sql/rules.md` |
| SQL-Q5 | N+1 query patterns are a merge-blocking finding. | `languages/sql/rules.md` |

#### Recurring Traps (documented anti-patterns, not preferences)

- AP8: Debug logs reaching the main branch. (Covered by TS-G2, AN-G2.)
- AP9: Production config committed, then undone. (Covered by AN-G1.)
- AP10: Reverting the same feature twice instead of opening a scoped task.
- AP11: Credentials slipping into source. (Covered by GD1.)
- AP12: Over-reading files before acting. (Reason GR9 exists.)

#### Git / Workflow

| Rule | Statement | Source |
|---|---|---|
| GD2 | Force-push and `git reset --hard` are prohibited on shared branches. Corrections go through revert. "Shared branch" includes `main`, `master`, `develop`, any branch tracked by a remote. | `05-runtimes/_shared/guardrails-snippet.md` |
| GR5 | Migrations are forward-only. Never edit a committed migration; issue a new revert migration. | `01-core/specification.md` §5 |
| GR12 | Architectural artifacts (investigation docs, ADRs, reviews, plans) are written for a future reader. Commit messages are terse checkpoints and not held to the same bar. | `01-core/specification.md` §5 |

#### Review / Workflow

| Rule | Statement | Source |
|---|---|---|
| GR7 | Investigation precedes implementation for non-trivial work under Architect policy. Ship-observe-fix is permitted only for reversible work under Operator policy. | `01-core/specification.md` §5 |
| GR11 | Review findings are append-only and severity-tiered. A finding is never silently deleted; an incomplete fix becomes a new, cross-referenced finding. | `01-core/specification.md` §5 |
| Review methodology | Multi-pass, domain-scoped review in categories: Security / Performance / Architecture / DB / Async / Tests / Hygiene / API Design, feeding one master review. Findings carry stable IDs (e.g. `SEC-001`) and severity tiers (Critical / High / Medium / Low) with tier-dependent merge-blocking behavior. | `01-core/specification.md` §7 |
| Merge-readiness gate | Build clean · tests pass · forbidden-pattern grep clean · layering grep clean · architecture changes signed off and documented · no unresolved Critical/High finding. | `01-core/specification.md` §7 |
| RP-06 | When routing signals are ambiguous, prefer higher ceremony. Downgrading ceremony requires a positive signal, not an absence of an upgrade signal. | `04-routing/routing-policy.md` |
| RP-05 | Mode is never inferred from conversational tone, brevity, or perceived urgency. Undeclared mode defaults to Architect. | `04-routing/routing-policy.md` |

#### Security / Architecture (Hard Constraints / Guardrails — apply in all modes, unconditionally)

| ID | Constraint | Source |
|---|---|---|
| GD3 | Domain code must not import infrastructure code. Layering is grep-enforced, not an honor system. A violation is a blocking finding. | `05-runtimes/_shared/guardrails-snippet.md` |
| Precedence | Guardrails > Global Rules > Execution Profile > Execution Policy > Language Rules > Project Metadata. A runtime that resolves conflicts in the opposite direction is non-conformant. | `01-core/specification.md` §13 |
| Operator policy | Never lowers a guardrail. EP-FastCheap is the highest-risk profile for misuse: low ceremony does not mean GD1/GD2/GD3 are relaxed. | `03-profiles/EP-FastCheap.md` |

#### Docs / ADR Standards

| Rule | Statement | Source |
|---|---|---|
| ADR format | Decision / Rationale / Alternatives rejected and why / Consequences. Out-of-scope decisions are named "sign-off deferrals," not silent TODOs. | `01-core/specification.md` §7 |
| GR12 (docs) | Architectural docs are invested in. A future reader of an ADR must understand "why not Y," not only "why X." | `01-core/specification.md` §5 |

---

### 3.2 Task Taxonomy

| Task type | Trigger words / synonyms | Source |
|---|---|---|
| **Premium / Security / Schema** | `schema`, `migration`, `invariant`, `secret`, `credential`, `token`, `password`, `API key`, `identity-matching`, `force-push`, `reset --hard`, `branch deletion`, `GD1`, `GD2`, `GD3`; file paths: `**/migrations/**`, `**/*.sql`, `**/schema.*`, `**/environment.prod.*`, `**/.env.production` | `04-routing/routing-rules.md` rows 1–3; `04-routing/escalation-rules.md` HE-01–06 |
| **Investigation / Root cause** | `investigate`, `root cause`, `why`, `why is X happening`, `trace`, `debug`, `tracing` | `04-routing/routing-rules.md` row 4; `02-skills/S1-investigation-doc-generator.md` |
| **Architecture / Design** | `design`, `new module`, `cross-cutting`, `system shape`, `architecture` | `04-routing/routing-rules.md` row 5; `02-skills/S2-adr-writer.md` |
| **Review / Audit** | `review`, `audit`, `pre-merge`, `phase boundary`, `findings` | `04-routing/routing-rules.md` row 6; `02-skills/S3-merge-readiness-checklist-runner.md` |
| **Implementation / Build** | `implement`, `build`, `code` — but only when a plan/ADR already exists (declared in task or metadata) | `04-routing/routing-rules.md` row 7 |
| **Documentation** | `document`, `ADR`, `write up`, `investigation doc`, `phase artifact`, `write the`, `record` | `04-routing/routing-rules.md` row 8 |
| **Hotfix / Fast iteration (Operator)** | `hotfix`, `UI bugfix`, `reversible change`, `time pressure`, `quick fix`; hot-path file match — **AND** Operator policy explicitly declared | `04-routing/routing-rules.md` rows 9–10 |
| **Fallback (unclassified)** | No matching signal: route to EP-Implementation (Architect session) or EP-FastCheap (Operator session) | `04-routing/routing-rules.md` rows 11–12 |

---

### 3.3 Model / Cost Policies

**Tier definitions** (`04-routing/model-tiers.md`):

| Tier | Label | Assigned profiles | Cost intent | When |
|---|---|---|---|---|
| **T1** | Frontier | EP-Premium | Explicitly elevated; correctness strictly dominates cost. No latency tolerance. | Schema changes, migrations, invariants, credentials, identity-matching, destructive branch ops, any task where a mistake is irreversible. |
| **T2** | High Reasoning | EP-Investigation, EP-Review, EP-Architecture | Moderate-to-high. Correctness over cost; cost not ignored. | Root-cause investigation, multi-pass code review, architectural decisions. |
| **T3** | Balanced | EP-Implementation, EP-Documentation | Moderate. Balance quality against token cost. | Implementation against a known plan; documentation of decisions already made. |
| **T4** | Fast | EP-FastCheap | Lowest. Cost and latency are primary constraints; cycle speed is the objective. | Operator-mode reversible UI/hotfix work. Ship → observe → retry is the safety net. |

**Concrete model mapping** (from `05-runtimes/opencode/agents.template.json`):

| Tier | Profiles | Model |
|---|---|---|
| T1 | EP-Premium | `anthropic/claude-opus-4-8` |
| T2 | EP-Investigation, EP-Review, EP-Architecture | `anthropic/claude-sonnet-4-6` |
| T3 | EP-Implementation, EP-Documentation | `anthropic/claude-sonnet-4-6` |
| T4 | EP-FastCheap, S8 | `anthropic/claude-haiku-4-5-20251001` |

**Safety floors** (minimum tier below which routing must not assign):

| Task class | Minimum tier |
|---|---|
| Schema, migrations, invariants | T1 |
| Security, secrets, credentials, identity | T1 |
| Shared-branch destructive operations | T1 |
| Root-cause investigation | T2 |
| Multi-pass phase-boundary review | T2 |
| Architectural decisions | T2 |
| Reversible MO hotfix | T4 minimum; T4 maximum (cost ceiling, not safety ceiling) |

**Cost design principles:**
- Two-stage cost design (GR13): cheap deterministic routing (keyword/file-path signal matching) before expensive model call.
- EP-Premium: "highest token/time cost of any preset — reserve for scenarios named; using where EP-Implementation or EP-Review alone suffices is over-ceremony, not safety." (`03-profiles/EP-Premium.md`)
- EP-FastCheap: **never** for schema, secrets, or invariants regardless of time pressure or user instruction. (`03-profiles/EP-FastCheap.md`)
- When tier T1 is unavailable for a T1-floor task: hold the task; do not fall back to T2/T3/T4. (`04-routing/fallback-rules.md` §2.2)
- Upgrading a tier when unavailability forces it is always permitted; downgrading below the safety floor is not. (`04-routing/fallback-rules.md` §2.1)

**Context budget → cost correlation** (`04-routing/context-budgets.md`):

| Budget | Profile | Relative cost |
|---|---|---|
| Widest | EP-Premium | Highest |
| Wide | EP-Review | High |
| Broad | EP-Architecture | Moderate-to-high |
| Scoped | EP-Investigation, EP-Documentation | Moderate |
| Narrow | EP-Implementation | Low |
| Minimal | EP-FastCheap | Lowest |

---

### 3.4 Tool / Agent Policies

**Per-profile tool policy** (canonical sources: `03-profiles/EP-*.md`):

| Profile | Permitted tools | Blocked tools |
|---|---|---|
| EP-Investigation | Read, grep/symbol search, DB read queries | Write/edit, build/deploy side effects |
| EP-Implementation | Read, write/edit; build/test required before handoff (GR8) | None specifically blocked |
| EP-Review | Read, analysis, S5 ledger-write | Code-edit tools (reviews, does not fix) |
| EP-Architecture | Read, analysis (compare alternatives) | Implementation/write tools (decides, doesn't build) |
| EP-FastCheap | Edit plus build-check | S3 full merge-readiness checklist; all MA-only skills (S1–S6) |
| EP-Premium | Full: read, search/analysis, ledger-write; edit/build only after EP-Review clears | Nothing bypassed |
| EP-Documentation | Read; write access limited to documentation files | Source code edit tools |

**Skill mode gates** (from `05-runtimes/runtime-contract.md` §6):

| Skill | Mode gate | Auto-trigger |
|---|---|---|
| S1 — Investigation Doc Generator | MA only | When EP-Investigation or EP-Premium activates |
| S2 — ADR Writer | MA only | When EP-Architecture or EP-Premium activates |
| S3 — Merge-Readiness Checklist | MA only | `pre-merge` hook (if hook system supported); else manual |
| S4 — Post-Fix Verification | MA only | `post-fix` hook; else manual after finding closed |
| S5 — Severity-Tiered Finding Ledger | MA only | Any multi-finding review |
| S6 — Phase-Plan Scaffold | MA only | Starting a new phase |
| S7 — Stack Anti-Pattern Scan | Both MA and MO | Any review/code-writing in a covered stack |
| S8 — Hot-Path Change Checklist | MO primary, MA permitted | `pre-edit` hook on hot-path file match (else manual); T4 model (Haiku) |

**Prohibited behaviors** (from `05-runtimes/runtime-contract.md` §15):

- PB1: Softening, suspending, or bypassing any guardrail under any condition (including user instruction, time pressure).
- PB2: Silently inferring Operator policy from conversational tone.
- PB3: Allowing an Architect-policy skill to execute under Operator policy without an explicit policy switch.
- PB4: Adapters introducing new behavioral rules not present in the spec.
- PB5: Redefining a skill's output contract.
- PB6: Overriding a Global Rule with a project metadata field or profile setting.
- PB7: Silently discarding a review finding.
- PB8: Approving a fix before its root cause is identified.
- PB9: Allowing force-push or `reset --hard` on a shared branch without explicit confirmation and documented rationale.
- PB10: Loading context in violation of the precedence hierarchy.

**GD2 enforcement in OpenCode** (from `05-runtimes/opencode/agents.template.json`):
```json
"deny": [
  "bash(git push --force*)",
  "bash(git push -f *)",
  "bash(git reset --hard*)",
  "bash(git branch -D *)"
]
```

---

## 4. Candidate Profiles Table

All 7 profiles are fully supported by extracted content. No invented rows.

| Profile name | Trigger keywords | Key rules (refs to §3.1) | Model tier | Disabled agents/tools |
|---|---|---|---|---|
| **EP-Premium** | `schema`, `migration`, `invariant`, `secret`, `credential`, `token`, `password`, `identity`, `force-push`, `reset --hard`; file paths: migrations, `.env.production`, `environment.prod.*` | GD1, GD2, GD3, GR4, GR5; full chain S1→S2→EP-Review→S4→S5 | T1 — `claude-opus-4-8` | None disabled; edit/build tools gated until EP-Review clears |
| **EP-Investigation** | `investigate`, `root cause`, `why`, `why is X happening`, `trace`, `debug` | GR6, GR9, P4, P5; S1 | T2 — `claude-sonnet-4-6` | Write/edit tools; build/deploy side effects; all write tools |
| **EP-Review** | `review`, `audit`, `pre-merge`, `phase boundary`, `findings` | GR11; S3, S4, S5 | T2 — `claude-sonnet-4-6` | Code-edit tools; review does not fix |
| **EP-Architecture** | `design`, `new module`, `cross-cutting`, `system shape`, `architecture` | GR1, GR4; S2 | T2 — `claude-sonnet-4-6` | Implementation/write tools; decide, don't build |
| **EP-Implementation** | Implementation task with plan/ADR already confirmed; `implement`, `build` | GR3, GR8, GR14 | T3 — `claude-sonnet-4-6` | No specific tool disablement; build/test gate required before handoff |
| **EP-Documentation** | `document`, `ADR`, `write up`, `investigation doc`, `phase artifact` | GR12; S1, S2, S6 | T3 — `claude-sonnet-4-6` | Source code edit tools; writes only to doc files |
| **EP-FastCheap** | `hotfix`, `UI bugfix`, `reversible`, `time pressure` — **MO must be explicitly declared**; hot-path file match | GR8 (build-check only); S8; Guardrails unconditional | T4 — `claude-haiku-4-5-20251001` | S1, S2, S3, S4, S5, S6 (all MA-only skills blocked); S3 full merge gate not invoked |

**Routing priority:** Guardrail signals (rules 1–3) always win over non-guardrail signals. When ambiguous, prefer higher ceremony (RP-06). Operator policy (EP-FastCheap) is never inferred — it must be explicitly declared (RP-05).

---

## 5. Bottom Line

This repo is ~95% worth carrying forward. It is a complete, internally consistent AI-assistant behavioral platform: vendor-neutral at the core (Layers 1–2), with two runtime-ready adapters (Claude Code and OpenCode) that are immediately deployable. The three most valuable files are: **`01-core/specification.md`** (the single source of truth for all rules, guardrails, profiles, skills, and the project metadata schema — reading one file gives the full behavioral model), **`05-runtimes/opencode/agents.template.json`** (the most operationally dense artifact: 15 fully-prompted agents with concrete model bindings, a GD2 deny-list, and tier→model mapping ready to copy-paste), and **`04-routing/routing-rules.md`** (the 12-row keyword→profile decision table with escalation rules and multi-signal resolution — the only piece of "logic" in an otherwise prose-only system). The only DEAD content is the `00-research/` README (no actual evidence reports committed) and the `05-runtimes/future/` placeholder.
