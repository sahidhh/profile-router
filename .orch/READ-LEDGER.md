# READ-LEDGER

Format: <path> | <sha-or-lines> | <1-line digest>

Sub-agents: before reading any file, check this ledger for an existing entry and reuse it instead of re-reading. After reading a file, append a new row here.

---
package.json | root, 34 lines | devDependency @oh-my-pi/pi-coding-agent pinned at 16.4.1, scripts: typecheck/test/check
node_modules/@oh-my-pi/pi-coding-agent/package.json | header | installed version confirmed 16.4.1, matches devDependency
node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/hooks/types.ts | 1-614 | HookAPI.on() overloads incl. `on(event: "session.compacting", handler: HookHandler<SessionCompactingEvent, SessionCompactingResult>)` — confirms literal dotted event name exists in installed version
node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/compact-handler.ts | 1-41 | unrelated helper (runExtensionCompact) for ctx.compact() action wiring, not the compaction event itself
node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/shared-events.ts | 58-350 (grep) | SessionCompactingEvent {type:"session.compacting", sessionId, messages}; SessionCompactingResult {context?, prompt?, preserveData?}; fires BEFORE compaction summarization (to influence prompt/context), SessionCompactEvent fires AFTER (no result type)
profile-router.ts | 1-810 | full extension source; session.compacting handler already implemented at lines 554-562, re-injects active.rules via result.context when active profile has rules
API-FINDINGS.md | 290-370 | documents session.compacting API finding (f); contains 2026-07-15 SUPERSEDED/FALSIFIED note: systemPrompt (not messages) carries rules and is resent every model call, never compacted, so handler is believed redundant but kept as harmless no-op
DECISIONS.md | 420-460 | Phase 10 decision log for T3 mid-run compaction re-injection; also carries the 2026-07-15 SUPERSEDED/FALSIFIED note striking this from open work
test/profile-router.test.ts | 1093-1146 | describe("session.compacting: mid-run rule re-injection") — 3 tests: active rules present in result.context, active=null no-op, matched profile with zero rules no-op
bundles.json | full, 350 lines (pre-T2/T3) | 7 profiles; readonly "separate pass" scope statements untagged; write profiles (implementation/premium/hotfix) had no suppresses; truncation rule duplicated verbatim in all 7 profiles' rules
profile-router.ts | 1-810 (T2/T3 pass) | merge()/resolveRules() at ~244-333: kill-set union across matched profiles' suppresses filters tagged RuleEntry only, untagged always survive; Bundles.default was Partial<Profile> with no commonRules field
test/profile-router.test.ts | 1-620, 1580-1623 (read, old) | merge() describe block (Branch A suppression tests) + bundles.json reachability describe (T04-06/T2/golden tests incl. T06 golden "lookup escape-hatch survives co-match" which must stay untouched); edited in T6 to add 4 telemetry tests
--- T6 TELEMETRY-LOG (this pass) ---
profile-router.ts | 405-551 (read, before_agent_start section) | before_agent_start hook at line 450-551 is the real routing entrypoint; classify() at 461, merge() at 489 produce routing decision for every prompt
profile-router.ts | edited, +logTelemetry() | Added logTelemetry() function (lines 415-452) that appends JSON-lines to .profile-router-telemetry.log with: timestamp, truncated prompt (200 chars), chosen profile, margin (winner - runner-up), runner-up profile name. Margin reuses T5's computation (explain() all profiles, find winner and runner-up scores).
profile-router.ts | edited, +telemetry call | Added telemetry invocation (lines 503-506) inside before_agent_start hook: calls explain() to score all profiles, then logTelemetry() to log routing decision when next.matched.length > 0
test/profile-router.test.ts | edited, +4 tests (lines 1834-1926) | new describe block "telemetry: routing decisions logged to .profile-router-telemetry.log" — (a) append-only grows file line-by-line, (b) logs correct fields with types, (c) truncates long prompts to ~200 chars, (d) computes margin as winner-runnerup; 129/129 pass
.orch/summaries/08-telemetry-log.md | created | T6 summary: routing entrypoint location, log format (JSON-lines, .profile-router-telemetry.log), implementation (logTelemetry + call site), tests, npm run check result (PASS 129/129)
bundles.schema.json | full, 158 lines (pre-T2/T3) | profile/partialProfile/ruleEntry defs, additionalProperties:false on both profile shapes — commonRules needed explicit schema addition to partialProfile
--- T2/T3 FIX APPLIED (this pass) ---
bundles.json | edited | tagged 4 "separate pass" rules with {tag:"readonly-scope"} (architecture/review/investigation/lookup); added suppresses:["readonly-scope"] to implementation/premium/hotfix; moved truncation rule to default.commonRules, removed from all 7 profiles' own rules
profile-router.ts | edited | Bundles.default type += commonRules?: RuleEntry[]; merge() resolveRules calls updated to merge order default.rules→commonRules (fallback) and commonRules→profile.rules (matched)
bundles.schema.json | edited | added commonRules property to partialProfile definition
test/profile-router.test.ts | edited, +9 tests | symmetric suppression (fixture + real bundles), commonRules dedup/order (fixture + real bundles); 122/122 pass, tsc clean
--- T2b HOTFIX-EXCLUDEKEYWORDS FIX APPLIED (this pass) ---
bundles.json | edited | added excludeKeywords: ["schema", "secret", "migration", "invariant", "credential"] to hotfix profile (line 254-259); field already defined in schema and enforced by profile-router.ts scoreProfile() since T01-03
profile-router.ts | verified, no change | excludeKeywords already enforced at line 141-143 in scoreProfile() function; ANY hit disqualifies profile with score=-Infinity
bundles.schema.json | verified, no change | excludeKeywords already defined as array of strings (line 47-51), description "Any hit disqualifies this profile (score = -Infinity)"
test/profile-router.test.ts | edited, +1 test | added '"urgent fix for the schema migration" -> premium (hotfix disqualified by excludeKeywords "schema"/"migration")' test; 123/123 pass, tsc clean
--- T3b MODEL-SHAPE NORMALIZATION (this pass) ---
bundles.json | edited | normalized premium.model from string "anthropic/claude-opus-4-8" to array ["anthropic/claude-opus-4-8"]; 6 other profiles unchanged (already arrays)
bundles.schema.json | edited | simplified model field from oneOf[string, array] to array-only in both profile and partialProfile definitions
profile-router.ts | edited | Profile/MergedConfig interfaces: model?: string[] (removed union); validateBundles: array-only validation; model resolution loop: iterate next.model directly (removed conditional); modelStr() helper simplified
test/profile-router.test.ts | edited | 8 fixture strings→arrays; 5 assertions: assert.equal→assert.deepEqual with array values; 123/123 pass, tsc clean
--- T5 CONFIDENCE MARGIN (this pass) ---
profile-router.ts | 1-810 (T5 pass, reused prior full-read digest) | formatTraceLines() at 606-624 is the shared formatter for /profile debug trace (465-476) and /profile explain (681-694); explain() at 234-245 scores ALL profiles sorted desc, powers the trace
profile-router.ts | edited | formatTraceLines(): added Δ margin line = scored[0].score - (scored[1]?.score ?? 0), with "(vs runner-up NAME)" or "(no runner-up — full score)" annotation
test/profile-router.test.ts | edited, +2 tests | new describe("/profile debug trace: confidence margin"): (a) winner+runner-up margin=1, (b) sole winner -> margin=winner's full score; 125/125 pass, tsc clean
--- T7 STICKY-CONTINUATION PHRASES (this pass) ---
profile-router.ts | 178-228 | isStickyContinuation() at 196-201 is a simple Set<string>.has() exact-match check (tokenCount<6 OR CONTINUATION_PHRASES.has(trimmed)); CONTINUATION_PHRASES Set at 182-195; text pre-lowercased by classify() caller
profile-router.ts | edited | added "now fix it" to CONTINUATION_PHRASES (only new phrase of the 4 requested; "continue"/"go on"/"next" already present, skipped as duplicates)
test/profile-router.test.ts | 1743-1765 (read) + edited, +4 tests | found existing stickiness test pattern (classify first prompt -> investigation, then classify phrase as turn2 with prevProfileName, assert inherited); added 4 tests, one per requested phrase ("continue","now fix it","go on","next"); 133/133 pass, tsc clean
.orch/summaries/09-sticky-continuation-phrases.md | created | T7 summary: function location, list shape, 1 new/3 duplicate phrases, diff, tests added, npm run check PASS 133/133
