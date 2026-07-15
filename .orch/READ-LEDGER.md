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
test/profile-router.test.ts | 1-620, 1580-1623 | merge() describe block (Branch A suppression tests) + bundles.json reachability describe (T04-06/T2/golden tests incl. T06 golden "lookup escape-hatch survives co-match" which must stay untouched)
bundles.schema.json | full, 158 lines (pre-T2/T3) | profile/partialProfile/ruleEntry defs, additionalProperties:false on both profile shapes — commonRules needed explicit schema addition to partialProfile
--- T2/T3 FIX APPLIED (this pass) ---
bundles.json | edited | tagged 4 "separate pass" rules with {tag:"readonly-scope"} (architecture/review/investigation/lookup); added suppresses:["readonly-scope"] to implementation/premium/hotfix; moved truncation rule to default.commonRules, removed from all 7 profiles' own rules
profile-router.ts | edited | Bundles.default type += commonRules?: RuleEntry[]; merge() resolveRules calls updated to merge order default.rules→commonRules (fallback) and commonRules→profile.rules (matched)
bundles.schema.json | edited | added commonRules property to partialProfile definition
test/profile-router.test.ts | edited, +9 tests | symmetric suppression (fixture + real bundles), commonRules dedup/order (fixture + real bundles); 122/122 pass, tsc clean
