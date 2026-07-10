# SALVAGE.md — ekc-workspace-final

Generated: 2026-07-10 | Read-only recon pass

---

## 1. Verdict Table

| Artifact | Present? | Path |
|---|---|---|
| `bundles.json` or profile/bundle config file | **ABSENT** | — |
| `promptbuilder.py` or prompt-classification / profile-merging code | **ABSENT** | — |
| keyword→task-type mapping (code or docs) | **ABSENT** | — |

The repo contains no JSON, Python, or config files of any kind. The only task-type signal is the role→model mapping and command set embedded in `.claude/WORKFLOW.md`.

---

## 2. Inventory

| File | What it is | Rating |
|---|---|---|
| `.claude/CLAUDE.md` | Session discipline goals (serial, session-aware, model split, review cap) | **REUSE** |
| `.claude/WORKFLOW.md` | Full role→model map, session loop, budget checkpoint, stop conditions, handoff template | **REUSE** |
| `.claude/commands/next.md` | `/next` slash command — drives session loop | **REUSE** |
| `.claude/commands/review.md` | `/review` slash command — criteria + max fix cycles | **REUSE** |
| `.claude/commands/finish.md` | `/finish` slash command — bookkeeping + HANDOFF write | **REUSE** |
| `.claude/commands/resume.md` | `/resume` slash command — load HANDOFF then invoke /next | **REUSE** |
| `.claude/commands/summarize.md` | `/summarize` slash command — one-page summary | **REUSE** |
| `Templates/artifact-template.md` | Artifact structure: Purpose / Scope / Design / Invariants / Risks / Required Updates | **REUSE** |
| `Templates/review-template.md` | Review structure: Ownership / Contracts / Invariants / Determinism / Layering / Terminology / Verdict | **REUSE** |
| `Templates/summary-template.md` | Summary structure: Purpose / Key Decisions / Invariants / Dependencies / Outputs | **REUSE** |
| `Project Source/Project Management/HANDOFF.md` | Session handoff record (format is the valuable thing, content is stale) | **MINE** |
| `Project Source/Project Management/roadmap.md` | Phase checklist; all items checked; shows phase naming convention | **MINE** |
| `Project Source/Project Management/manifest.yaml` | Minimal state tracker (phase, last_completed, next_task) | **MINE** |
| `Project Source/Project Management/next-task.md` | Next-task format: task name, dependencies, deliverables, after-completion steps | **MINE** |
| `Project Source/Project Management/review-ledger.md` | Accepted/deferred/rejected/known-limitations review log with rich rationale | **MINE** |
| `Project Source/Project Management/decisions.md` | Append-only architectural decision log (format only; content is empty) | **MINE** |
| `Project Source/Engineering Design/INDEX.md` | Phase→artifact index | **MINE** |
| `Project Source/Engineering Design/Compiler/01 - Repository Architecture.md` | Layering rules, project dependency graph, public/internal API seam, test organization, MVP cut discipline | **MINE** |
| `Project Source/Engineering Design/Compiler/02 - Domain Model.md` | Domain modeling rules: identity, invariants, lifecycle, extension model, risk taxonomy | **MINE** |
| `Project Source/Engineering Design/Compiler/03 - Compiler Pipeline.md` | Pipeline philosophy, seam model, determinism mandate, failure semantics, incremental-caching discipline | **MINE** |
| `Project Source/Engineering Design/Compiler/04 - Pipeline Contracts.md` | Contract discipline: semantic contracts ≠ API, precondition ladder, postcondition monotonicity, immutable snapshot rule, backward-compatibility law | **MINE** |
| `Project Source/Engineering Design/Compiler/05 - Internal Compiler Artifacts & Data Flow.md` | Artifact lifetime taxonomy (Transient/Ephemeral-Internal/Handoff/Run-scoped), provenance overlay rules | **MINE** |
| `Project Source/Engineering Design/Compiler/06 - P1 Normalization Pass Specification.md` | Compiler pass spec — domain-specific | **DEAD** |
| `Project Source/Engineering Design/Compiler/07 - P2 Linking Pass Specification.md` | Compiler pass spec — domain-specific | **DEAD** |
| `Project Source/Engineering Design/Compiler/08 - P3 Validation Pass Specification.md` | Compiler pass spec — domain-specific | **DEAD** |
| `Project Source/Engineering Design/Compiler/09 - P4 Precedence Resolution Pass Specification.md` | Compiler pass spec — domain-specific | **DEAD** |
| `Project Source/Engineering Design/Compiler/10 - P5 Lowering Pass Specification.md` | Compiler pass spec — domain-specific | **DEAD** |
| `Project Source/Engineering Design/Compiler/11 - P6 IR Canonicalization Pass Specification.md` | Compiler pass spec — domain-specific | **DEAD** |
| `Project Source/Engineering Design/Planner/01 - Execution Planner Architecture.md` | Planner architecture — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/02 - Planner Artifacts & Data Flow.md` | Planner artifacts — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/03 - Execution Plan Specification.md` | Execution plan spec — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/04 - Runtime Capability Profile.md` | Runtime capability model — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/05 - Capability Resolution.md` | Capability resolution — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/06 - Strategy Selection.md` | Strategy selection — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/07 - Execution Ordering.md` | Execution ordering — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/08 - Planner Contracts.md` | Planner contracts — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/09 - Planner Review.md` | Planner review — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Planner/10 - Planner Consolidation.md` | Planner consolidation — execution planner subsystem | **DEAD** |
| `Project Source/Engineering Design/Adapter/A01 - Adapter Architecture.md` | Adapter architecture — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A02 - Adapter Artifacts & Data Flow.md` | Adapter artifacts — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A03 - Runtime Code Generation Spec.md` | Code generation spec — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A04 - Target-Specific Translators.md` | Target translators — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A05 - Adapter Contracts.md` | Adapter contracts — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A06 - Adapter Testing Strategy.md` | Adapter test strategy — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A07 - Adapter Review.md` | Adapter review — adapter layer | **DEAD** |
| `Project Source/Engineering Design/Adapter/A08 - Adapter Consolidation.md` | Adapter consolidation — adapter layer | **DEAD** |
| `Project Source/Engineering Design/SDK/SK01 - SK07` (7 files) | SDK orchestration subsystem — platform-specific | **DEAD** |
| `Project Source/Implementation/ADR - Decision Freeze.md` | Dense set of frozen architectural principles, forbidden shortcuts, approved flexibility, implementation checklist | **MINE** |
| `Project Source/Implementation/Architecture Test Specification.md` | Test taxonomy: RT-* IDs, CI stage ordering, P0/P1/P2 priority scheme, fail-fast CI rules | **MINE** |
| `Project Source/Implementation/Implementation Roadmap.md` | Phase sequencing discipline, exit criteria format, verification gate pattern, parallel vs. serial workstream rules | **MINE** |
| `Project Source/Reviews/Compiler Design Consistency Review.md` | Cross-artifact consistency review — domain-specific findings | **MINE** |
| `Project Source/Reviews/Final Specification Synchronization.md` | Applied-findings log, open-question format, accepted-debt table, architecture-status declaration | **MINE** |
| `Project Source/Session Dumps/Progress Report 2026-07-07.md` | One-off session summary — stale project state | **DEAD** |
| `Project Source/Session Dumps/Session Dump 2026-07-07.md` | Unread (inferred from pattern): session execution log | **DEAD** |
| `Project Source/Summaries/Compiler/*.summary.md` (11 files) | Per-artifact compression summaries, Compiler phase | **MINE** |
| `Project Source/Summaries/Planner/*.summary.md` (7 files) | Per-artifact compression summaries, Planner phase | **DEAD** |
| `Project Source/Project Management/Summaries/**` (25 files) | Management-layer per-artifact summaries | **DEAD** |

---

## 3. Salvage Extraction

### 3.1 Engineering Rules / Guardrails / Standards

#### Architecture

- **"Layering is grep-enforced, not honor-system."** Dependency boundaries must be mechanically enforced (project references + `internal` visibility + architecture tests that fail CI), not enforced by convention or code review alone. *Source: Compiler/01 §5, WORKFLOW.md*
- **"Every project must earn its place (P2)."** A module/abstraction is justified only when a second real consumer exists. Do not build for one hypothetical consumer. *Source: Compiler/01 §4*
- **"Each has exactly one reason to change."** Single responsibility is an enforced rule, not a guideline. When a module's responsibility is ambiguous, it is a design defect. *Source: Compiler/01 §4*
- **"Emitters/adapters cannot see each other — no cross-coupling, ever."** Parallel back-end targets must be isolated. Shared helpers live in a host layer, and only after a second real consumer exists. *Source: Compiler/01 §5, ADR §11*
- **"New stacks arrive as data in the spec, not as code in emitters."** Adapters must consume the model generically. No hardcoded `if stack == X` branching. Extension is additive (new package/adapter), never a core edit. *Source: Compiler/01 §10*
- **"No layer calls back upstream; no layer skips a layer."** Pipeline is strictly one-directional: Compiler → Planner → Adapter → SDK. No upstream import from a downstream layer. No layer-skipping shortcuts. *Source: ADR §2*
- **"Additive-only overlays."** Downstream layers add selection/order/syntax to upstream artifacts. They may not add, remove, or alter meaning. *Source: ADR §2.3*
- **"The Compiler repo must not couple to a specific version of library content."** Content is fed at runtime via an interface (`ISpecSource`), never a build dependency. *Source: Compiler/01 §0, ADR §13 D6*
- **"No persistence / repository / DB layer"** on a stateless transform tool. Reflexive application of repository patterns to a file-in/file-out pipeline is a hollow abstraction (AP1 anti-pattern). *Source: Compiler/01 §4*
- **"Do not pre-resolve open questions before second consumer exists."** Deferred decisions stay deferred until real evidence arrives. Speculative structure is explicitly rejected. *Source: Compiler/01 §13, ADR §12*

#### Determinism

- **"Same inputs → byte-identical output, in every subsystem, always."** Every transform is a pure total function of its declared input tuple. No wall-clock, no collection-iteration-order dependence, no randomness, no live runtime queries, no hidden session state. *Source: ADR §2.4, §6*
- **"IR ids are derived, never freshly allocated."** An allocated id that depends on processing order breaks determinism and is forbidden. *Source: ADR §7*
- **"Canonical ordering uses a fixed kind-rank enumeration; IR id is the terminal tie-break."** Never configuration-dependent or runtime-dependent reordering. *Source: ADR §6*
- **"Diagnostics ordering must be deterministic and byte-stable."** Ordered by contributing stage, then element id, then diagnostic code. *Source: ADR §6*
- **"Cycle detection is a hard stop, never a diagnostic-and-continue."** A cycle is a content impossibility; the pipeline halts for that element, does not degrade to advisory. *Source: ADR §6, §13 ADR-10*
- **"Caching is allowed only where the function is pure."** Caches are an approved implementation choice; they must never make output depend on call history. *Source: ADR §12*

#### Testing

- **"Structure before behavior."** The full project graph and its architecture tests exist from Phase 0, before any pass/stage/emitter has real logic. Architecture tests must be red the moment a forbidden reference is added — never merely aspirational. *Source: Implementation Roadmap §0*
- **"One subsystem's freeze gates the next subsystem's start."** Implementation mirrors the pipeline: a subsystem's implementation is not "done enough" until its own architecture-test tier is green. *Source: Implementation Roadmap §0*
- **"No skip flags on P0 tests."** No CI configuration may skip a P0 test for a merge to the default branch. A genuine exception requires a formal ADR amendment. *Source: Architecture Test Spec §17*
- **"P1 waivers are logged, not silent."** A P1 test may be waived per-PR only via an explicit, reviewed waiver recorded in the PR and the review ledger — never via a blanket CI config change. *Source: Architecture Test Spec §17*
- **"Determinism tests run on at least two OS targets."** A determinism/golden bug that only reproduces on one OS is still a bug. *Source: Architecture Test Spec §17*
- **"Every new subsystem inherits Stages 0–6 automatically."** The CI pipeline must apply architecture/determinism/golden tests to any project matching naming conventions without hand-written per-project CI wiring. *Source: Architecture Test Spec §17*
- **"Fail-fast ordering."** CI stages run in order and stop at the first blocking failure. Architecture violations (Stage 2) must never be masked by waiting on expensive golden/determinism runs (Stages 5–6). *Source: Architecture Test Spec §17*
- **"Handshake-completeness testing is the highest-value test."** Proves that Stage N's guarantees ⊇ Stage N+1's assumptions for every adjacent pair. A gap there is invisible until a specific input triggers it in production. *Source: Compiler/04 §9*
- **"Golden tests require explicit human approval for snapshot updates — never auto-accepted in CI."** *Source: Architecture Test Spec §13*
- **"Write the cycle/duplication/mismatch fixture first; make it pass by halting, not by degrading the policy."** Test-first discipline for invariant violations. *Source: Implementation Roadmap phases 12–13*
- **"Emitter snapshot tests must be byte-stable across Windows and Linux from the first committed snapshot."** Retrofitting cross-platform correctness is expensive. *Source: Implementation Roadmap Phase 17*

#### Contracts / Interfaces

- **"A consumer may rely on a producer's guarantees. It may rely on nothing else."** Not order, not timing, not internal structure, not incidental behavior. Anything not guaranteed is assumed absent. *Source: Compiler/04 §1*
- **"Contracts state what is true (postconditions), never how it was produced."** Mechanism language is banned from contract text. *Source: Compiler/04 §0*
- **"Promise more, require less."** A contract evolves compatibly only by adding guarantees or relaxing preconditions. Removing a guarantee or tightening a precondition is a breaking change, full stop. *Source: Compiler/04 §8*
- **"Every artifact that crosses a boundary is an immutable snapshot."** The producer relinquishes it; the consumer receives read-only. Pass-internal mutability is permitted; cross-boundary mutation is never. *Source: Compiler/04 §7, ADR §2.5*
- **"Exactly one owner per artifact."** The sole exception is Diagnostics, which is intentionally run-owned (multiple stages contribute). *Source: ADR §4*
- **"Each contract has a foreseeable second implementer — that is the bar for the interface existing."** One-implementer hollow interfaces are deleted. *Source: Compiler/01 §7*

#### Code Quality

- **"Default posture: nothing is lost between stages unless explicitly declared as an intentional projection."** Information preservation is the default; loss must be documented and justified. *Source: ADR §8*
- **"Duplication is reported, never resolved by merging."** Detected semantic duplicates each keep their distinct IDs; the diagnostic flags the issue; no merge occurs. *Source: ADR §8, Architecture Test Spec §6 RT-6.4*
- **"A domain object must not reference any compiler artifact."** The domain firewall: authored knowledge must never reference IR, plans, diagnostics, or emitted artifacts. *Source: Compiler/02 §5*
- **"No stage past the semantic freeze may change what an element means."** Enforcement level, confidence, condition, scope must survive byte-identical through every overlay. *Source: ADR §10, Architecture Test Spec RT-10.1*
- **"If a task appears to require a forbidden shortcut, stop and escalate — do not implement around it silently."** *Source: ADR §11*

#### Git / Workflow

- **"Serial execution only. No parallel agents, ever."** (Within-session discipline.) *Source: CLAUDE.md, WORKFLOW.md*
- **"Session-aware, not phase-aware."** Complete as many artifacts as safely fit in one session, then stop. Do not push into the next phase while momentum is good. *Source: CLAUDE.md*
- **"Resume from HANDOFF.md when present — skip re-reading full manifest/roadmap/ledger."** HANDOFF.md alone must be sufficient to resume; next session reads only it + relevant summaries. *Source: WORKFLOW.md*
- **"Load summaries before full docs, always. Load only direct dependencies."** *Source: WORKFLOW.md Token Policy*
- **"Never auto-advance into the next phase."** Phase-complete is a hard stop; the next phase starts only on a fresh `/next`. *Source: WORKFLOW.md Non-goals*
- **"Never skip review or summary steps."** *Source: WORKFLOW.md Non-goals*
- **"Always leave a complete HANDOFF.md before stopping."** The handoff template is non-negotiable; no prose beyond the template. *Source: CLAUDE.md, WORKFLOW.md*
- **"Build/test green before handoff (GR8)."** Universal done-signal; CI gate. *Source: Compiler/01 §11*

#### Docs

- **"No architecture redesign unless there is a correctness blocker."** *Source: CLAUDE.md*
- **"Maximum 2 review fix cycles per artifact."** Two consecutive review failures on the same artifact halts the loop for human intervention. *Source: CLAUDE.md, review.md*
- **"Review criteria are fixed: Ownership / Contracts / Invariants / Determinism / Layering / Terminology."** No ad hoc review criteria. *Source: review.md, review-template.md*
- **"Open questions are flagged, not buried."** Log them explicitly; do not harden them into structure until confirmed by evidence. *Source: Compiler/01 §13*
- **"Debt is explicitly accepted as non-blocking or it is not accepted."** Remaining open items are tracked as T-series debt with an implementation impact column. *Source: Final Specification Synchronization §2*
- **"ADR discipline: log rejected alternatives with their reason."** An engineering decision without its rejected alternatives is incomplete. *Source: Compiler/01 §12, decisions.md*

---

### 3.2 Task Taxonomy

| Task type | Trigger words / synonyms found in docs |
|---|---|
| **Artifact authoring** | "build artifact", "write artifact", "create", "draft", "design", "/next" |
| **Review** | "review", "check", "evaluate", "audit", "/review", "review criteria", "verdict" |
| **Bookkeeping** | "update", "manifest", "roadmap", "ledger", "next-task", "handoff write", "/finish" |
| **Investigation / Resume** | "resume", "load", "dependency retrieval", "budget check", "/resume", "caveman" |
| **Summarize** | "summarize", "summary", "compress", "/summarize", "one-page" |
| **Budget checkpoint** | "budget", "checkpoint", "context consumed", "stop condition", "safe to continue" |
| **Synchronization** | "synchronize", "sync", "apply findings", "localized edits", "terminology alignment" |
| **Phase gate / Verification** | "verification gate", "freeze", "green before", "phase complete", "exit criteria" |

---

### 3.3 Model / Cost Policies

All policies sourced from `.claude/WORKFLOW.md` and `.claude/CLAUDE.md`.

| Task | Model tier | Rationale |
|---|---|---|
| Manifest, roadmap, ledger, next-task, HANDOFF writes | **Haiku** | Deterministic, mechanical — pure formatting/writing |
| Loading/compressing summaries, dependency retrieval, budget check | **Haiku** | Retrieval, not judgment |
| Summary generation (default) | **Haiku** | Escalate to Sonnet only if real compression judgment is needed |
| Artifact authoring | **Sonnet** | Judgment work |
| Artifact review | **Sonnet** | Judgment work |

**Core rule:** "Deterministic step → Haiku. Sonnet touches only judgment work. No exceptions."

**Budget checkpoint rule:** After each accepted artifact, run a cheap Haiku budget checkpoint. Stop if:
- Context feels >70% consumed, OR
- 2 artifacts already completed this session on a large phase, OR
- Next artifact's dependency set requires loading >3 full source docs (not summaries)

**Token conservation:** Resume from HANDOFF.md (not full manifest/roadmap); load summaries before full docs; load only direct dependencies.

---

### 3.4 Tool / Agent Policies

All policies sourced from `.claude/WORKFLOW.md`.

| Policy | Detail |
|---|---|
| **No parallel agents, ever** | Serial execution only. No exceptions. |
| **No custom agents unless cave-crew lacks the role** | Reuse existing roles (builder, reviewer, bookkeeper, investigator). |
| **Haiku for all mechanical steps** | Budget checkpoints, bookkeeping, retrieval, summary writes. |
| **Sonnet for artifact authoring and review only** | The two judgment-intensive tasks; no others escalate. |
| **Stop conditions are exhaustive** | Budget unsafe · phase complete · implementation blocker · frozen-decision conflict · review-failure×2. Anything else: continue. |
| **All stops emit HANDOFF.md** | No stop without a handoff. |
| **No architecture redesign sub-tasks** | Only surface design changes at a correctness blocker level. |
| **Max 2 review fix cycles** | On the third failure, stop loop and escalate to human. |

---

## 4. Candidate Profiles Table

Profiles synthesized from sections 3.1–3.4 above. Only profiles with actual content support are included.

| Profile name | Trigger keywords | Key rules (refs to §3.1) | Model tier | Disabled agents/tools |
|---|---|---|---|---|
| **artifact-builder** | build, write, create artifact, draft, design, /next | Serial-only; structure-before-behavior; no redesign unless correctness blocker; max 2 review cycles; save every accepted artifact; update summary + roadmap + manifest + ledger after accept | Sonnet | Parallel agents; Haiku for this role |
| **reviewer** | review, check, evaluate, audit, /review | Fixed criteria only (ownership/contracts/invariants/determinism/layering/terminology); max 2 fix cycles; 2nd failure = halt + escalate; no ad hoc criteria | Sonnet | Parallel agents; Haiku for this role |
| **bookkeeper** | update, manifest, roadmap, ledger, next-task, handoff, summarize, /finish, /summarize | Pure mechanical writes only; deterministic output; no judgment work; load summaries not full docs; write HANDOFF from template only, no prose beyond template | Haiku | Sonnet (never use for bookkeeping); parallel agents |
| **investigator** | resume, load, dependency retrieval, budget check, /resume | Read HANDOFF.md only on resume; load summaries before full docs; check budget (>70% context / 2 artifacts / >3 source docs = stop); mark HANDOFF closed after load | Haiku | Sonnet; parallel agents |
| **phase-gatekeeper** | verification gate, freeze, exit criteria, green before, phase complete | One subsystem's freeze gates next; no code in next subsystem until gate is green; structure (arch tests) before behavior (logic); verification gate = explicit checkpoint commit/tag | Sonnet (judgment on what counts as green) | Parallel phase starts; auto-advance into next phase |

---

## 5. Bottom Line

Roughly **30% of this repo's files are worth carrying forward**. The DEAD files (Compiler passes 06–11, all 10 Planner docs, all 8 Adapter docs, all 7 SDK docs, Session Dumps) make up the bulk of the file count but contain zero extractable engineering rules not already stated in the 5 MINE files that matter.

**The 3 most valuable files:**

1. **`.claude/WORKFLOW.md`** — The entire session discipline in one file: role→model mapping, the artifact loop, budget checkpoint criteria, stop conditions, and the non-negotiable HANDOFF template. This is the operating system of the workspace; everything else runs on it.

2. **`Project Source/Implementation/ADR - Decision Freeze.md`** — The densest concentration of transferable engineering rules: 7 non-negotiable architectural principles (§2), 10 explicitly named forbidden shortcuts (§11), approved implementation flexibilities (§12), and an implementation PR checklist (§14) that converts the architecture into a merge gate. Every principle here is stated precisely enough to be enforced mechanically.

3. **`Project Source/Implementation/Architecture Test Specification.md`** — The most complete test taxonomy in the repo: named test IDs (RT-*), P0/P1/P2 priority scheme, a 9-stage ordered CI pipeline with blocking/advisory classification, and cross-cutting CI rules (no P0 skip flags, logged P1 waivers, mandatory cross-platform determinism). This is a template for making any architecture self-defending, not just EKC's.
