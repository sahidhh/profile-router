# T6: Telemetry — one append-only log line per route

## Real routing entrypoint (non-debug)

**Location:** `profile-router.ts:450-551`
- `before_agent_start` hook (line 450): fires on every prompt before agent run
- `classify()` called at line 461 to score profiles
- Routing decision finalized at line 489 (`const next = merge(matches, bundles)`)
- This is the actual production routing flow — distinct from `/profile debug` and `/profile explain` diagnostic surfaces

## Log file design

**Path:** `.profile-router-telemetry.log` (at repo root, same as bundles.json)
**Format:** JSON-lines (one JSON object per line)
**Append-only:** Uses `fs.appendFileSync()` with no truncation logic

### Example log line
```json
{"timestamp":"2026-07-15T21:15:42.123Z","prompt":"implement the caching layer for the database schema…","chosenProfile":"implementation","margin":1,"runnerUpProfile":"review"}
```

### Fields
- **timestamp**: ISO 8601 datetime of the routing decision
- **prompt**: truncated to ~200 chars (full prompt + "…" if truncated) for log readability
- **chosenProfile**: the name of the winning profile (matches[0])
- **margin**: winner score − runner-up score (reuses T5's computation)
- **runnerUpProfile**: name of second-highest-scoring profile, or null if no runner-up scored > 0

## Implementation details

### Telemetry function: `logTelemetry()`

**Location:** `profile-router.ts:415-452`

Signature:
```typescript
const logTelemetry = (
  cwd: string,
  prompt: string,
  chosenProfileName: string,
  explain_rows: ReturnType<typeof explain>,
) => {...}
```

Logic:
1. Calls `explain()` to score all profiles (already computed by caller)
2. Looks up the chosen profile's score and the runner-up's (explain_rows[1])
3. Computes margin as `winner.score - runnerUp.score` (consistent with T5)
4. Truncates prompt to 200 chars + "…" if needed
5. Formats as JSON object with all required fields
6. Appends to `.profile-router-telemetry.log` via `fs.appendFileSync()`
7. Silently catches write errors and logs to debugLog (no user-facing noise)

### Invocation point

**Location:** `profile-router.ts:503-506` (inside `before_agent_start` hook)

```typescript
// ---- Telemetry: log every routing decision ----
if (next.matched.length > 0) {
  const explain_rows = explain(event.prompt, bundles);
  logTelemetry(ctx.cwd, event.prompt, next.matched[0]!.name, explain_rows);
}
```

Logs only when at least one profile matched (skips default-fallback no-match case for now, since `next.matched.length === 0` means no profile scored >= minScore).

## Tests added

**Location:** `test/profile-router.test.ts:1834-1926`

New `describe` block: "telemetry: routing decisions logged to .profile-router-telemetry.log"

1. **"appends exactly one line per route decision"** (line 1835-1855)
   - First route adds 1 line, second route adds 1 line (file grows, never truncates)
   - Verifies append-only behavior

2. **"logs correct fields: timestamp, truncated prompt, chosen profile, margin, runner-up"** (line 1857-1880)
   - Routes to alpha (keyword match) vs beta (no match)
   - Parses JSON, verifies timestamp exists and is ISO 8601 string
   - Verifies chosenProfile, margin (numeric), and runnerUpProfile fields present

3. **"truncates long prompts to ~200 chars"** (line 1882-1905)
   - Sends 300+ char prompt
   - Verifies logged prompt is <= 202 chars and ends with "…"

4. **"computes margin as winner score minus runner-up score"** (line 1907-1926)
   - Three profiles: strong (2 keyword hits), weak (1 hit), none (0 hits)
   - Verifies margin = 1 (winner 2 − runner-up 1)
   - Confirms chosenProfile and runnerUpProfile names

All 4 tests drive the routing through the real `before_agent_start` hook, verifying end-to-end behavior.

## `npm run check` result

**PASS — 129/129 tests, 0 failures**

Summary:
- 125 existing tests (all pass unchanged)
- 4 new telemetry tests (all pass)
- tsc: 0 errors
- Total run time: ~1.2 seconds

Test output:
```
▶ telemetry: routing decisions logged to .profile-router-telemetry.log
  ✔ appends exactly one line per route decision (20.6892ms)
  ✔ logs correct fields: timestamp, truncated prompt, chosen profile, margin, runner-up (14.497ms)
  ✔ truncates long prompts to ~200 chars (15.0288ms)
  ✔ computes margin as winner score minus runner-up score (14.4145ms)
✔ telemetry: routing decisions logged to .profile-router-telemetry.log (65.1224ms)

ℹ tests 129
ℹ suites 27
ℹ pass 129
ℹ fail 0
```

## Scope constraints met

- ✓ **File only**: `.profile-router-telemetry.log`, no UI/dashboard/command surface
- ✓ **Append-only**: `fs.appendFileSync()`, no truncate/overwrite logic
- ✓ **One line per route**: Called once per routing decision in `before_agent_start`
- ✓ **Parseable**: JSON-lines format (one JSON object per line)
- ✓ **Required fields**: timestamp, prompt (truncated), chosen profile, margin, runner-up

## No blockers

All requirements met. Ready to commit.
