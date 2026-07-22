/**
 * profile-router.ts — OMP extension
 * Install:
 *   Project: .omp/extensions/profile-router.ts   (auto-discovered; .omp/ must be non-empty — bundles.json satisfies that)
 *   Global:  ~/.omp/agent/extensions/profile-router.ts   (default profile; named profiles use ~/.omp/profiles/<name>/agent/extensions/)
 * Config:  .omp/bundles.json (project-local) → ~/.omp/bundles.json (global fallback)
 *
 * Behavior:
 *  - Reclassifies EVERY prompt via keyword matching (no LLM call)
 *  - Injects merged profile rules into system prompt per-agent-run
 *  - Blocks disabled agents/tools via tool_call hook
 *  - Model changes require one-tap confirm; remembers answer per (from→to) pair
 *  - /profile command: status + manual override (sticky until cleared)
 *
 * All API usage below is verified against the installed @oh-my-pi/pi-coding-agent
 * source/types (v16.4.1) — see API-FINDINGS.md for file:line evidence.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

// ---------- Types (mirror bundles.json schema) ----------

// A rule is either a plain string (untagged; always survives suppression) or a
// tagged entry { tag, text } that a co-matched profile's `suppresses` list can remove
// at merge time (Branch A: destructive, order-independent negation).
export type RuleEntry = string | { tag: string; text: string };

export interface Profile {
  name: string;
  description?: string;         // one-line human summary (display only; never affects classification)
  keywords: string[];          // legacy classifier terms; weight 1 (always scored, in addition to verbs/scopes)
  verbs?: string[];             // weak/rhetorical action words (e.g. "explain", "find"); weight 1
  scopes?: string[];            // code-element / breadth nouns (e.g. "function", "repository"); weight 2
  excludeKeywords?: string[];   // ANY hit disqualifies the profile (score = -Infinity)
  minScore?: number;            // qualifying threshold for this profile; default 1 (preserves legacy score>0 routing)
  capabilities?: { read?: boolean; write?: boolean; execute?: boolean }; // declarative; drives suppression/escape-hatch conventions, not enforced by merge() itself
  suppresses?: string[];        // rule tags this profile removes from the merged set (union across all matched profiles)
  rules?: RuleEntry[];          // injected into system prompt; union by text, then tagged entries filtered by suppresses
  skills?: string[];           // union
  tools?: string[];            // union
  disabledAgents?: string[];   // INTERSECTION across matched profiles
  model?: string[];            // fallback chain: first resolvable wins
  thinkingLevel?: string;      // single-value: highest score wins
}

export interface Bundles {
  profiles: Profile[];         // declaration order = tiebreak order
  default?: Partial<Profile> & {
    // Rules shared by every profile (e.g. the truncation-handling rule), so the
    // wording is declared once instead of copy-pasted into each profile's `rules`.
    // Merge order is default.rules -> commonRules -> profile.rules (dedup by text).
    commonRules?: RuleEntry[];
  };
}

export interface MergedConfig {
  matched: { name: string; score: number }[];
  rules: string[];
  skills: string[];
  tools: string[];
  disabledAgents: string[];
  model?: string[];
  thinkingLevel?: string;
}

const DEBUG = process.env.PROFILE_ROUTER_DEBUG === "1";

/** Rotate the telemetry log past this size (~1 MiB ≈ tens of thousands of routes). */
const TELEMETRY_MAX_BYTES = 1_048_576;

// ---------- Config loading (project-local overrides global) ----------

/** Tracks whether we've already warned about a malformed/missing config this process, per path. */
const warnedPaths = new Set<string>();

/**
 * Load the first-existing bundles.json candidate AND its content hash (sha256,
 * first 12 hex chars) from a single disk read, so the change-notice hash and the
 * applied config can never come from two different file states.
 * hash is null when no file exists or the read itself fails; a file that reads
 * but fails to parse still hashes (the change notice should fire on a bad edit).
 */
export function loadBundlesWithHash(cwd: string, notify?: (msg: string) => void): { bundles: Bundles; hash: string | null } {
  const candidates = [path.join(cwd, ".omp", "bundles.json"), path.join(os.homedir(), ".omp", "bundles.json")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let hash: string | null = null;
    try {
      const raw = fs.readFileSync(p, "utf-8");
      hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 12);
      const parsed = JSON.parse(raw) as Bundles;
      if (!parsed || !Array.isArray(parsed.profiles)) {
        throw new Error("bundles.json must have a top-level \"profiles\" array");
      }
      return { bundles: parsed, hash };
    } catch (err) {
      if (!warnedPaths.has(p)) {
        warnedPaths.add(p);
        notify?.(`profile-router: failed to parse ${p} (${(err as Error).message}) — continuing with no profiles`);
      }
      return { bundles: { profiles: [] }, hash };
    }
  }
  return { bundles: { profiles: [] }, hash: null };
}

export function loadBundles(cwd: string, notify?: (msg: string) => void): Bundles {
  return loadBundlesWithHash(cwd, notify).bundles;
}

// ---------- Classification (keyword scoring, word-boundary matching) ----------

/**
 * Score a single profile against already-lowercased prompt text.
 * Records WHICH keywords claimed a span (not just the count) so the same logic
 * powers both classify() (score only) and explain() (score + matched keywords).
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryTest(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`).test(text);
}

/**
 * Two-axis scoring: keywords (legacy, weight 1) and verbs (weight 1) are weak
 * signals; scopes (weight 2) are strong breadth/topic signals. All three
 * categories are always scored together — a profile that adds verbs/scopes
 * does not lose its existing `keywords` contribution. Any excludeKeywords hit
 * disqualifies the profile outright (score = -Infinity), independent of the
 * claimed-span logic below.
 */
export function scoreProfile(text: string, profile: Profile): { score: number; matched: string[] } {
  for (const kw of profile.excludeKeywords ?? []) {
    if (wordBoundaryTest(text, kw)) return { score: -Infinity, matched: [] };
  }

  // Claimed text spans, so a longer phrase (e.g. "code review") and a shorter
  // keyword it contains (e.g. "review") can't both score off the same words —
  // now shared across keywords/verbs/scopes so e.g. "auth flow" (scope) beats
  // a bare "flow" (also a scope) at the same span.
  const claimed: [number, number][] = [];
  const overlapsClaimed = (start: number, end: number) => claimed.some(([s, e]) => start < e && s < end);
  const matched: string[] = [];
  let score = 0;

  const terms: { term: string; weight: number }[] = [
    ...profile.keywords.map((term) => ({ term, weight: 1 })),
    ...(profile.verbs ?? []).map((term) => ({ term, weight: 1 })),
    ...(profile.scopes ?? []).map((term) => ({ term, weight: 2 })),
  ];
  const byLengthDesc = terms.sort((a, b) => b.term.length - a.term.length);
  for (const { term, weight } of byLengthDesc) {
    // Word-boundary match beats naive substring ("fix" shouldn't hit "prefix").
    const re = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlapsClaimed(start, end)) {
        claimed.push([start, end]);
        matched.push(term);
        score += weight;
        break;
      }
    }
  }
  return { score, matched };
}

// Stickiness: a turn with no qualifying match inherits the previous turn's
// profile when the new prompt is short (<6 tokens) — i.e. it's plausibly a bare
// continuation ("ok", "continue", "now fix it", ...) still talking about the
// same thing rather than starting a new topic. Every known continuation phrase
// is under 6 tokens, so the token threshold alone covers them; a phrase list
// would only matter for continuations of 6+ tokens, which don't exist.
function isStickyContinuation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return trimmed.split(/\s+/).length < 6;
}

/**
 * Verbs that mean "change something", used to stop a read-only profile from being
 * inherited into a turn that plainly wants to act. Deliberately does NOT include
 * bare continuations ("ok", "continue", "go on", "next") — those SHOULD inherit.
 */
const ACTION_VERBS = [
  "fix", "change", "add", "remove", "delete", "update", "edit", "write",
  "rename", "refactor", "patch", "apply", "revert", "implement", "install", "create",
];

function hasActionVerb(text: string): boolean {
  return ACTION_VERBS.some((v) => wordBoundaryTest(text, v));
}

export function classify(
  prompt: string,
  bundles: Bundles,
  prevProfileName?: string | null,
): { profile: Profile; score: number; inherited?: boolean }[] {
  const text = prompt.toLowerCase();
  const hits: { profile: Profile; score: number; order: number }[] = [];

  bundles.profiles.forEach((profile, order) => {
    const { score } = scoreProfile(text, profile);
    const minScore = profile.minScore ?? 1;
    if (score >= minScore) hits.push({ profile, score, order });
  });

  // Sort: score desc, then declaration order asc (tiebreak rule)
  hits.sort((a, b) => b.score - a.score || a.order - b.order);

  if (hits.length === 0 && prevProfileName) {
    const prevProfile = bundles.profiles.find((p) => p.name === prevProfileName);
    // A read-only profile must not be inherited into a turn that asks for a change.
    // "now fix it" after a `lookup` turn used to inherit lookup's restricted toolset
    // (no edit/write/bash), its blocked subagents, and its micro model — producing a
    // refusal or a failed edit instead of work. Falling through to `default` gives the
    // turn a full toolset; a genuine continuation ("ok", "continue") still inherits.
    const wantsToAct = prevProfile?.capabilities?.write === false && hasActionVerb(text);
    if (prevProfile && isStickyContinuation(text) && !wantsToAct) {
      return [{ profile: prevProfile, score: 0, inherited: true }];
    }
  }

  return hits.map(({ profile, score }) => ({ profile, score }));
}

/**
 * Explain how a prompt classifies against EVERY profile (including score 0),
 * sorted score-desc then declaration order. Powers the /profile debug trace.
 */
export function explain(
  prompt: string,
  bundles: Bundles,
): { name: string; score: number; matched: string[]; order: number }[] {
  const text = prompt.toLowerCase();
  const rows = bundles.profiles.map((profile, order) => {
    const { score, matched } = scoreProfile(text, profile);
    return { name: profile.name, score, matched, order };
  });
  rows.sort((a, b) => b.score - a.score || a.order - b.order);
  return rows;
}

// ---------- Merge (union / intersection / highest-score) ----------

const ruleText = (r: RuleEntry): string => (typeof r === "string" ? r : r.text);
const ruleTag = (r: RuleEntry): string | undefined => (typeof r === "string" ? undefined : r.tag);

/**
 * Union RuleEntry lists (dedup by text, first occurrence wins declaration order),
 * then drop any tagged entry whose tag is in `kill`. Untagged (plain string) rules
 * are never suppressed. Returns plain text for system-prompt injection.
 */
function resolveRules(ruleLists: (RuleEntry[] | undefined)[], kill: Set<string>): string[] {
  const seen = new Set<string>();
  const merged: RuleEntry[] = [];
  for (const list of ruleLists) {
    for (const r of list ?? []) {
      const key = ruleText(r);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(r);
      }
    }
  }
  return merged.filter((r) => {
    const tag = ruleTag(r);
    return tag === undefined || !kill.has(tag);
  }).map(ruleText);
}

export function merge(matches: { profile: Profile; score: number }[], bundles: Bundles): MergedConfig {
  const cfg: MergedConfig = {
    matched: matches.map((m) => ({ name: m.profile.name, score: m.score })),
    rules: [],
    skills: [],
    tools: [],
    disabledAgents: [],
  };

  const union = (target: string[], src?: string[]) => {
    for (const item of src ?? []) if (!target.includes(item)) target.push(item);
  };

  if (matches.length === 0) {
    // Fallback to default profile when nothing matched.
    if (bundles.default) {
      // Merge order: default.rules -> default.commonRules (dedup by text; commonRules
      // holds wording shared across every profile, e.g. the truncation-handling rule).
      cfg.rules = resolveRules([bundles.default.rules, bundles.default.commonRules], new Set());
      union(cfg.skills, bundles.default.skills);
      union(cfg.tools, bundles.default.tools);
      cfg.disabledAgents = bundles.default.disabledAgents ?? [];
    }
    cfg.model = bundles.default?.model;
    cfg.thinkingLevel = bundles.default?.thinkingLevel;
    return cfg;
  }

  // Rule suppression (Branch A): union all matched profiles' rules by text, union all
  // matched profiles' `suppresses` tags, then drop any tagged rule whose tag is killed.
  // Destructive and order-independent — a suppressing co-match always wins over union.
  // Merge order: default.commonRules first (shared wording, deduped against any profile
  // that still declares the same text), then each matched profile's own rules.
  const kill = new Set<string>();
  for (const { profile } of matches) for (const tag of profile.suppresses ?? []) kill.add(tag);
  cfg.rules = resolveRules([bundles.default?.commonRules, ...matches.map((m) => m.profile.rules)], kill);

  // disabledAgents: intersection — any matched profile that leaves an agent
  // enabled keeps it enabled overall.
  let disabled: Set<string> | null = null;
  for (const { profile } of matches) {
    union(cfg.skills, profile.skills);
    union(cfg.tools, profile.tools);
    const d = new Set(profile.disabledAgents ?? []);
    if (disabled === null) {
      disabled = d;
    } else {
      const prev: Set<string> = disabled;
      disabled = new Set([...prev].filter((x) => d.has(x)));
    }
  }
  cfg.disabledAgents = [...(disabled ?? [])];

  // Single-value fields: matches[0] is highest score + earliest declaration order.
  cfg.model = matches[0]?.profile.model ?? bundles.default?.model;
  cfg.thinkingLevel = matches[0]?.profile.thinkingLevel ?? bundles.default?.thinkingLevel;

  return cfg;
}

// ---------- Validation (structural checks for /profile validate) ----------

const VALID_THINKING_LEVELS = ["off", "low", "medium", "high"];

/** Returns a list of human-readable problems; empty list means the bundles are valid. */
export function validateBundles(bundles: Bundles): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  bundles.profiles.forEach((p, i) => {
    const label = p.name ? `"${p.name}"` : `profile #${i + 1}`;
    if (!p.name || !p.name.trim()) {
      problems.push(`${label}: missing or empty "name"`);
    } else if (seen.has(p.name)) {
      problems.push(`duplicate profile name "${p.name}"`);
    } else {
      seen.add(p.name);
    }
    if (!Array.isArray(p.keywords) || p.keywords.length === 0) {
      problems.push(`${label}: "keywords" must be a non-empty array`);
    }
    // Every term list must hold only strings — a non-string entry passes Array.isArray
    // but crashes classify() at routing time (term.toLowerCase is not a function), i.e.
    // a config that "validated" would still take down the hook.
    const termFields: [string, unknown][] = [
      ["keywords", p.keywords],
      ["verbs", p.verbs],
      ["scopes", p.scopes],
      ["excludeKeywords", p.excludeKeywords],
    ];
    for (const [field, list] of termFields) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        // keywords' non-array case is already reported above
        if (field !== "keywords") problems.push(`${label}: "${field}" must be an array of strings`);
        continue;
      }
      if (list.some((t) => typeof t !== "string")) {
        problems.push(`${label}: "${field}" entries must all be strings`);
      }
    }
    if (p.minScore !== undefined && typeof p.minScore !== "number") {
      problems.push(`${label}: "minScore" must be a number`);
    }
    if (p.thinkingLevel !== undefined && !VALID_THINKING_LEVELS.includes(p.thinkingLevel)) {
      problems.push(`${label}: thinkingLevel "${p.thinkingLevel}" is not one of ${VALID_THINKING_LEVELS.join("/")}`);
    }
    if (p.model !== undefined && !(Array.isArray(p.model) && p.model.every((m) => typeof m === "string"))) {
      problems.push(`${label}: "model" must be an array of strings`);
    }
    if (p.rules !== undefined) {
      if (!Array.isArray(p.rules)) {
        problems.push(`${label}: "rules" must be an array`);
      } else {
        p.rules.forEach((r, ri) => {
          const ok =
            typeof r === "string" ||
            (typeof r === "object" && r !== null && typeof (r as { tag?: unknown }).tag === "string" && typeof (r as { text?: unknown }).text === "string");
          if (!ok) problems.push(`${label}: rules[${ri}] must be a string or {tag, text}`);
        });
      }
    }
    if (p.suppresses !== undefined && !(Array.isArray(p.suppresses) && p.suppresses.every((s) => typeof s === "string"))) {
      problems.push(`${label}: "suppresses" must be an array of strings`);
    }
    if (p.capabilities !== undefined) {
      // Shape check must precede key enumeration — Object.keys(null) throws, which
      // previously made the validator itself crash on `"capabilities": null`.
      const c: unknown = p.capabilities;
      if (typeof c !== "object" || c === null || Array.isArray(c)) {
        problems.push(`${label}: "capabilities" must be an object of {read?, write?, execute?: boolean}`);
      } else {
        const rec = c as Record<string, unknown>;
        const badKey = Object.keys(rec).find((k) => !["read", "write", "execute"].includes(k) || typeof rec[k] !== "boolean");
        if (badKey !== undefined) {
          problems.push(`${label}: "capabilities" must be an object of {read?, write?, execute?: boolean}`);
        }
      }
    }
  });

  return problems;
}

// ---------- Cost comparison (decides which model switches need a confirm) ----------

/** The pricing slice of a catalog Model: $/million tokens (pi-catalog `types.ts` `Model.cost`). */
type ModelCost = { input: number; output: number } | undefined;

/**
 * True only when `to` is unambiguously cheaper than `from` — strictly cheaper on BOTH
 * the input and output axes, with real (non-zero) prices on both sides.
 *
 * The confirm dialog exists to prevent surprise SPEND, so a switch that can only save
 * money does not need to interrupt the user. But that reasoning holds only when the
 * saving is certain: many catalog entries carry cost 0 meaning "unknown/unpriced", not
 * "free", and treating those as cheap would auto-apply switches to models of unknown
 * price. Anything ambiguous — missing cost, a zero on either side, cheaper on one axis
 * but dearer on the other — returns false and falls through to the normal confirm.
 */
export function isStrictDowngrade(from: ModelCost, to: ModelCost): boolean {
  if (!from || !to) return false;
  const known = (c: { input: number; output: number }) =>
    typeof c.input === "number" && typeof c.output === "number" && c.input > 0 && c.output > 0;
  if (!known(from) || !known(to)) return false;
  return to.input < from.input && to.output < from.output;
}

// ---------- Extension ----------

export default function (pi: ExtensionAPI) {
  let active: MergedConfig | null = null;
  let manualOverride: string | null = null;        // set via /profile <name>
  let manualOverrideOnce = false;                  // true when manualOverride is a turn-scoped pin (/profile <name> --once)
  let lastPrompt: string | null = null;             // tracks last classified prompt for /profile misroute
  let debugTrace = false;                          // toggled via /profile debug on|off
  let routingEnabled = true;                       // kill switch: /profile off pauses all routing (session-scoped)
  const modelDecisions = new Map<string, boolean>(); // "from→to" -> user's answer, for this session
  const unresolvedModelWarned = new Set<string>();   // model strings already warned about this session
  const promptsClassified = new Map<string, number>(); // profile name (or "default") -> count
  let manualPinsSet = 0;
  let modelSwitchesAccepted = 0;
  let modelSwitchesDeclined = 0;
  let modelSwitchesAuto = 0;                       // downgrades applied without a confirm
  let lastConfigHash: string | null = null;       // content hash from the most recent bundles.json load this session
  let stickyPrevProfile: string | null = null;    // last active profile name, for stickiness inheritance; reset on explicit /profile pin/clear or new session
  let baselineTools: string[] | null = null;      // toolset captured before the first profile restriction this session, restored on no-tools turns

  const debugLog = (msg: string, context?: Record<string, unknown>) => {
    if (DEBUG) pi.logger.debug(`[profile-router] ${msg}`, context);
  };

  // ---- Model-decision persistence: remembered (from→to) confirm answers survive sessions ----
  // Stored as .omp/model-decisions.json ({"from→to": bool}). In-memory answers win over the
  // file; delete the file to be asked again. Both accept AND decline persist — "remembers your
  // answer" must mean the same thing across restarts.
  let persistedDecisionsLoaded = false;
  const decisionsPath = (cwd: string) => path.join(cwd, ".omp", "model-decisions.json");

  const loadPersistedDecisions = (cwd: string) => {
    if (persistedDecisionsLoaded) return;
    persistedDecisionsLoaded = true;
    try {
      const parsed = JSON.parse(fs.readFileSync(decisionsPath(cwd), "utf-8")) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "boolean" && !modelDecisions.has(k)) modelDecisions.set(k, v);
      }
    } catch {
      // Missing or malformed file — start fresh; the next decision rewrites it.
    }
  };

  const persistDecisions = (cwd: string) => {
    try {
      fs.mkdirSync(path.join(cwd, ".omp"), { recursive: true });
      fs.writeFileSync(decisionsPath(cwd), JSON.stringify(Object.fromEntries(modelDecisions), null, 2) + "\n", "utf-8");
    } catch (err) {
      debugLog("model-decision persist failed", { error: (err as Error).message });
    }
  };

  /**
   * Log a telemetry entry for this routing decision to .profile-router-telemetry.log.
   * Appends one line per route.
   * Format: JSON-lines with timestamp, truncated prompt, chosen profile, margin, runner-up
   * name, and the model + thinking level the turn actually ran on.
   *
   * `model`/`thinkingLevel` are what makes the log answer "where did the money go" rather
   * than only "was the routing right" — a profile's declared model is not what it ran on
   * when the chain fell through, the user declined, or nothing resolved. Older rows lack
   * both fields; the reader treats them as unknown rather than discarding them.
   */
  const logTelemetry = (
    cwd: string,
    prompt: string,
    chosenProfileName: string,
    explain_rows: ReturnType<typeof explain>,
    appliedModel: string | null,
    thinkingLevel: string | null,
  ) => {
    try {
      // Find the chosen profile's score and runner-up in the full explain ranking.
      // Runner-up = the best-scoring profile OTHER than the chosen one — under a
      // manual pin or sticky inheritance the chosen profile need not be the top
      // scorer, so indexing [1] would log the wrong competitor. A negative margin
      // then correctly records that the classifier ranked another profile higher.
      const chosenRow = explain_rows.find((r) => r.name === chosenProfileName);
      const chosenScore = chosenRow?.score ?? 0;
      const runnerUpRow = explain_rows.find((r) => r.name !== chosenProfileName);
      const runnerUpScore = runnerUpRow?.score ?? 0;
      const margin = chosenScore - runnerUpScore;
      const runnerUpName = runnerUpRow?.name ?? null;

      // Truncate prompt to safe length (200 chars)
      const truncatedPrompt = prompt.length > 200 ? prompt.slice(0, 200) + "…" : prompt;

      const logEntry = {
        timestamp: new Date().toISOString(),
        prompt: truncatedPrompt,
        chosenProfile: chosenProfileName,
        margin,
        runnerUpProfile: runnerUpName,
        model: appliedModel,
        thinkingLevel,
      };

      const logPath = path.join(cwd, ".profile-router-telemetry.log");

      // Rotate before appending so the log can't grow without bound in a long-lived
      // project. One generation is kept (.1, overwritten) — this is tuning data, not an
      // audit trail, and the summary only ever reads the current file.
      try {
        if (fs.statSync(logPath).size > TELEMETRY_MAX_BYTES) {
          fs.renameSync(logPath, `${logPath}.1`);
        }
      } catch {
        // No log yet (or stat/rename refused) — nothing to rotate; the append below creates it.
      }

      fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n", "utf-8");
    } catch (err) {
      debugLog("telemetry write failed", { error: (err as Error).message });
    }
  };

  // ---- Every prompt: classify, merge, inject ----
  pi.on("before_agent_start", async (event, ctx) => {
    lastPrompt = event.prompt;

    // ---- Kill switch: /profile off pauses all routing ----
    // Model, thinking level, tools, and rules all pass through untouched — the turn
    // runs exactly as if this extension were not installed. We still release any
    // toolset the router had restricted (so `off` lifts the 🔒 immediately rather
    // than stranding a lookup-restricted toolset) and clear `active` so the tool_call
    // agent-block hook goes inert. `/profile on` resumes on the next prompt.
    if (!routingEnabled) {
      if (baselineTools !== null) {
        await pi.setActiveTools(baselineTools);
        baselineTools = null;
      }
      active = null;
      ctx.ui.setStatus("profile", "⏸ off");
      return;
    }

    const { bundles, hash: currentHash } = loadBundlesWithHash(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));

    // Telemetry and the debug trace both need the full explain() ranking; score
    // the profile table at most once per prompt and share the rows.
    let cachedExplainRows: ReturnType<typeof explain> | null = null;
    const explainRows = () => (cachedExplainRows ??= explain(event.prompt, bundles));

    if (currentHash !== null) {
      if (lastConfigHash !== null && currentHash !== lastConfigHash) {
        ctx.ui.notify(`bundles.json changed (${currentHash}) — applied`, "info");
      }
      lastConfigHash = currentHash;
    }

    let matches = classify(event.prompt, bundles, stickyPrevProfile);
    let overrideApplied = false;
    let overrideWasOnce = false;
    let overrideName: string | null = null;

    if (manualOverride) {
      const p = bundles.profiles.find((x) => x.name === manualOverride);
      if (p) {
        matches = [{ profile: p, score: Number.POSITIVE_INFINITY }];
        overrideApplied = true;
        overrideWasOnce = manualOverrideOnce;
        overrideName = manualOverride;
        if (manualOverrideOnce) {
          // Turn-scoped pin: consumed by this prompt, clear immediately so it
          // cannot leak into the next prompt's classification or labeling.
          manualOverride = null;
          manualOverrideOnce = false;
        }
      } else {
        // The pinned profile no longer exists (renamed/removed in bundles.json).
        // Clear the stale pin rather than silently falling back to auto-classification
        // while still labeling it as manually overridden.
        ctx.ui.notify(`Profile override "${manualOverride}" no longer exists — clearing pin, resuming auto-classification`, "warning");
        manualOverride = null;
        manualOverrideOnce = false;
      }
    }

    const next = merge(matches, bundles);
    active = next;

    // Stickiness memory: remember the resulting active profile (whether freshly
    // matched, inherited, or manually pinned) so the next turn can inherit it.
    if (next.matched.length > 0) stickyPrevProfile = next.matched[0]!.name;

    // Increment promptsClassified counter for each matched profile, or "default" if none matched
    const namesToCount = next.matched.length ? next.matched.map((m) => m.name) : ["default"];
    for (const n of namesToCount) promptsClassified.set(n, (promptsClassified.get(n) ?? 0) + 1);

    debugLog("classified", { prompt: event.prompt.slice(0, 80), matched: next.matched });

    // ---- Debug trace: explain WHY this prompt routed where it did (toggled via /profile debug) ----
    if (debugTrace) {
      const lines: string[] = [`🔎 Profile routing for "${event.prompt.slice(0, 60)}${event.prompt.length > 60 ? "…" : ""}"`];
      if (overrideApplied) {
        lines.push(`  → ${overrideName} (manual pin${overrideWasOnce ? ", once" : ""} — classification bypassed)`);
      } else if (matches[0]?.inherited) {
        lines.push(`  → ${matches[0].profile.name} (inherited from prev turn)`);
      } else {
        lines.push(...formatTraceLines(explainRows()));
      }
      ctx.ui.notify(lines.join("\n"), "info");
    }

    // Status line: ALWAYS visible so misclassification is caught before damage.
    // 🔒 marks a restricted toolset — otherwise the restriction is invisible until
    // a tool is missing mid-run.
    ctx.ui.setStatus(
      "profile",
      (next.matched.length
        ? `⚙ ${next.matched.map((m) => m.name).join("+")}${overrideApplied ? (overrideWasOnce ? " (manual, once)" : " (manual)") : ""}`
        : "⚙ default") + (next.tools.length > 0 ? " 🔒" : ""),
    );

    // ---- Model routing: suggest + confirm, only on actual change ----
    // `model` may be a fallback chain (["deepseek/...", "anthropic/..."]) — the chain
    // advances past any spec that fails to resolve or that has no credentials.
    // `appliedModel` records what the turn ACTUALLY ran on, for telemetry below: the
    // declared chain is not the answer when it fell through or the user declined.
    let appliedModel: string | null = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null;
    if (next.model) {
      const current = ctx.model;
      const profileNames = next.matched.map((m) => m.name).join("+") || "default";
      loadPersistedDecisions(ctx.cwd);

      // Walk the chain to the first spec that BOTH resolves against the catalog and
      // actually applies. Previously the loop broke on the first catalog-resolvable
      // spec and then called setModel once — but resolve() is catalog/alias-only and
      // never checks credentials (API-FINDINGS.md §"model"), so an uncredentialed
      // first link ended the chain with a warning and left the session on whatever
      // model it was already using. When that ambient model is the premium one, the
      // cheap profile silently bills at premium rates. A false from setModel now
      // advances to the next link instead of terminating the chain.
      let settled = false;                      // switch applied, already correct, or user said no
      const uncredentialed: string[] = [];      // resolved but setModel refused (no API key)

      for (const spec of next.model) {
        const resolved = ctx.models.resolve(spec);
        if (!resolved) continue;

        const changed = !current || resolved.id !== current.id || resolved.provider !== current.provider;
        if (!changed) {
          settled = true; // already on this model — nothing to switch, chain ends here
          break;
        }

        const key = `${current ? `${current.provider}/${current.id}` : "?"}→${resolved.provider}/${resolved.id}`;

        // A switch that can only save money is not a surprise-spend risk, so it applies
        // without a dialog — and deliberately ignores any remembered answer for this pair.
        // A single stray "no" used to disable a downgrade permanently and invisibly, which
        // is the expensive failure mode: the session just keeps paying the higher rate.
        // Announced (not silent) so the change is still visible in the transcript.
        const downgrade = isStrictDowngrade(
          (current as { cost?: { input: number; output: number } } | undefined)?.cost,
          (resolved as { cost?: { input: number; output: number } }).cost,
        );

        let approved: boolean;
        if (downgrade) {
          approved = true;
        } else {
          const remembered = modelDecisions.get(key);
          if (remembered === undefined) {
            approved = await ctx.ui.confirm(
              "Switch model?",
              `Profile "${profileNames}" suggests ${resolved.provider}/${resolved.id} (current: ${current ? `${current.provider}/${current.id}` : "unknown"})`,
            );
            modelDecisions.set(key, approved);
            persistDecisions(ctx.cwd);
          } else {
            approved = remembered;
          }
        }
        if (!approved) {
          // A decline means "stay where I am", not "try something cheaper" — the
          // chain stops rather than walking on to the next candidate.
          modelSwitchesDeclined++;
          settled = true;
          break;
        }

        if (await pi.setModel(resolved)) {
          appliedModel = `${resolved.provider}/${resolved.id}`;
          if (downgrade) {
            modelSwitchesAuto++;
            ctx.ui.notify(
              `Model → ${resolved.provider}/${resolved.id} for "${profileNames}" (cheaper than ${current!.provider}/${current!.id}; applied without asking)`,
              "info",
            );
          } else {
            modelSwitchesAccepted++;
          }
          settled = true;
          break;
        }

        // Missing credentials is an environment fact, not a user decision — forget the
        // remembered answer so a credentialed session asks again instead of inheriting
        // an approval that never took effect.
        modelDecisions.delete(key);
        persistDecisions(ctx.cwd);
        uncredentialed.push(`${resolved.provider}/${resolved.id}`);
      }

      if (!settled) {
        const warnKey = next.model.join(", ");
        if (!unresolvedModelWarned.has(warnKey)) {
          unresolvedModelWarned.add(warnKey);
          const detail = uncredentialed.length
            ? `no credentials for ${uncredentialed.join(", ")}`
            : "none could be resolved";
          ctx.ui.notify(
            `Profile "${profileNames}" references model${next.model.length > 1 ? "s" : ""} "${warnKey}" — ${detail}, continuing with the current model${current ? ` (${current.provider}/${current.id})` : ""}`,
            "warning",
          );
        }
        debugLog("model chain exhausted", { model: warnKey, uncredentialed });
      }
    }

    // ---- Thinking level: applied silently (no confirm — session generation parameter, not a cost switch) ----
    if (next.thinkingLevel) {
      pi.setThinkingLevel(next.thinkingLevel as Parameters<typeof pi.setThinkingLevel>[0]);
    }

    // ---- Telemetry: log every routing decision, including default (no-match) routes.
    // Default rows are the prompts the vocabulary missed — the highest-value tuning data.
    // Logged AFTER model/thinking are applied so the row records what the turn actually
    // ran on, not what the profile merely asked for.
    logTelemetry(
      ctx.cwd,
      event.prompt,
      next.matched[0]?.name ?? "default",
      explainRows(),
      appliedModel,
      next.thinkingLevel ?? null,
    );

    // ---- Active tools: restrict when the merged profile set specifies a tool list; restore
    // the session baseline when it doesn't. Previously a restriction persisted into
    // no-tools turns (a lookup-restricted toolset survived into an unrelated default prompt,
    // silently leaving edit/write/bash missing). The baseline is captured immediately before
    // the first restriction, so it reflects the session's real starting toolset.
    // getActiveTools() verified on ExtensionAPI: dist/types/extensibility/extensions/types.d.ts:734.
    if (next.tools.length > 0) {
      if (baselineTools === null && typeof pi.getActiveTools === "function") {
        baselineTools = pi.getActiveTools();
      }
      await pi.setActiveTools(next.tools);
    } else if (baselineTools !== null) {
      await pi.setActiveTools(baselineTools);
      baselineTools = null;
    }

    // ---- Rules injection into system prompt for this agent run ----
    const block = buildInjectionBlock(next);
    if (block) {
      return { systemPrompt: [...event.systemPrompt, block] };
    }
    // Silent when profile unchanged and no rules — zero UI noise.
  });

  // ---- session.compacting fires mid-run when the agent auto-compacts context.
  // Believed-redundant: systemPrompt is not compacted, so the active rules cannot be lost to
  // compaction and this handler is not needed to preserve them. Verified in the installed runtime:
  //   - node_modules/@oh-my-pi/pi-agent-core/src/agent-loop.ts:834-837 — "Refresh prompt/tool
  //     context from live state before each model call" → calls syncContextBeforeModelCall.
  //   - node_modules/@oh-my-pi/pi-agent-core/src/agent.ts:1150-1156 — that sync reassigns
  //     context.systemPrompt = this.#state.systemPrompt, i.e. it is re-read from live agent state
  //     and resent on every model call.
  //   - node_modules/@oh-my-pi/pi-agent-core/src/compaction/compaction.ts:1094-1106
  //     (CompactionPreparation) and :145-155 (CompactionResult) carry messages only — systemPrompt
  //     is neither an input nor an output of compaction; the summarizer call itself swaps in
  //     SUMMARIZATION_SYSTEM_PROMPT (:855).
  // Retained as harmless. Note it is not literally a no-op: the returned `context` is appended to
  // the *summarization prompt* (shared-events.ts:344-345 "Additional context lines to include in
  // summary" → compaction.ts:826), so it can only bias the generated summary toward rule-relevant
  // detail. That is a nice-to-have, not the rule-preservation mechanism it was written to be.
  // See .orch/DECISIONS.md T1.
  // Event/result shapes verified at dist/types/extensibility/extensions/types.d.ts:652 and
  // dist/types/extensibility/shared-events.d.ts:66-70,276-284 (see API-FINDINGS.md).
  pi.on("session.compacting", async (_event, _ctx) => {
    if (!active || active.rules.length === 0) return;
    return {
      context: [
        `## Active Engineering Rules (${active.matched.map((m) => m.name).join("+") || "default"})\n` +
        active.rules.map((r) => `- ${r}`).join("\n"),
      ],
    };
  });

  // ---- Enforce disabledAgents ----
  pi.on("tool_call", async (event) => {
    if (!active || active.disabledAgents.length === 0) return;
    if (event.toolName !== "task") return;
    const target = String((event.input as Record<string, unknown>)?.agent ?? "task");
    if (active.disabledAgents.includes(target)) {
      return {
        block: true,
        reason: `Agent "${target}" disabled by profile ${active.matched.map((m) => m.name).join("+") || "default"}`,
      };
    }
  });

  const modelStr = (m?: string[]) => (m ? m.join(" → ") : "unset");

  /**
   * Build the injection block that contains rules and skills for system prompt injection.
   * Returns the formatted string if there are rules/skills to inject, or null if empty.
   */
  const buildInjectionBlock = (cfg: MergedConfig): string | null => {
    const parts: string[] = [];
    if (cfg.rules.length > 0) {
      parts.push(
        `## Active Engineering Rules (${cfg.matched.map((m) => m.name).join("+") || "default"})\n` +
        cfg.rules.map((r) => `- ${r}`).join("\n"),
      );
    }
    if (cfg.skills.length > 0) {
      parts.push(`## Recommended Skills\n${cfg.skills.map((s) => `- ${s}`).join("\n")}`);
    }
    return parts.length > 0 ? parts.join("\n\n") : null;
  };

  /**
   * Format the output of explain() into a human-readable trace fragment.
   * (Does not include the header — caller provides that in the header line.)
   */
  const formatTraceLines = (rows: ReturnType<typeof explain>): string[] => {
    const lines: string[] = [];
    const scored = rows.filter((r) => r.score > 0);
    if (scored.length === 0) {
      lines.push("  → default (no keywords matched)");
    } else {
      scored.forEach((r, i) => {
        const mark = i === 0 ? "→" : " ";
        lines.push(`  ${mark} ${r.name}: ${r.score}  [${r.matched.join(", ")}]${i === 0 ? "  ← chosen" : ""}`);
      });
      // Confidence margin: winner's score minus the runner-up's — the second-highest-scoring
      // candidate profile, even if it never cleared minScore / matched. When no runner-up
      // exists (every other profile scored 0), the margin equals the winner's full score.
      const winner = scored[0]!;
      const runnerUp = scored[1];
      const margin = winner.score - (runnerUp ? runnerUp.score : 0);
      lines.push(
        runnerUp
          ? `  Δ margin: ${margin} (vs runner-up "${runnerUp.name}")`
          : `  Δ margin: ${margin} (no runner-up — full score)`,
      );
    }
    const zero = rows.length - scored.length;
    if (zero > 0) lines.push(`  (${zero} other profile${zero === 1 ? "" : "s"} scored 0)`);
    return lines;
  };

  // ---- /profile subcommand dispatch table ----
  // Each entry is a self-contained, void-returning handler that produces its effect purely
  // through ctx.ui.notify / file writes / closure-state mutation — the exact bodies moved out
  // of the former if-chain. The dispatcher (in the command handler below) looks up `sub` here.
  // NOT in this table, by design: `clear` (matched on the whole arg, checked first), the
  // `--once` pin, the bare `<name>` pin, and the bare status line — their ordering is
  // load-bearing (clear first; pin/status as the fall-through default) so they stay inline.
  type CommandCtx = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];
  type SubHandler = (arg: string, rest: string[], sub: string, ctx: CommandCtx) => void | Promise<void>;

  const SUBCOMMANDS: Record<string, SubHandler> = {
    // ---- /profile list : every profile with its one-line summary ----
    list: (_arg, _rest, _sub, ctx) => {
      const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
      if (bundles.profiles.length === 0) {
        ctx.ui.notify("No profiles loaded (bundles.json missing, empty, or malformed).", "warning");
        return;
      }
      const lines = bundles.profiles.map((p) => {
        const summary = p.description ?? `keywords: ${p.keywords.join(", ")}`;
        return `• ${p.name} — ${summary}\n    model: ${modelStr(p.model)} | thinking: ${p.thinkingLevel ?? "unset"}`;
      });
      const def = bundles.default
        ? `\ndefault (no match) → model: ${modelStr(bundles.default.model)} | thinking: ${bundles.default.thinkingLevel ?? "unset"}`
        : "";
      ctx.ui.notify(`Profiles (${bundles.profiles.length}):\n${lines.join("\n")}${def}`, "info");
    },

    // ---- /profile debug [on|off] : toggle the per-request routing trace ----
    debug: (_arg, rest, _sub, ctx) => {
      const mode = (rest[0] ?? "").toLowerCase();
      if (mode === "on") debugTrace = true;
      else if (mode === "off") debugTrace = false;
      else debugTrace = !debugTrace; // bare `/profile debug` toggles
      ctx.ui.notify(
        `Profile debug trace ${debugTrace ? "ON — each prompt will show why a profile is chosen" : "OFF"}`,
        "info",
      );
    },

    // ---- /profile off : pause all routing (kill switch) ----
    // Idempotent. Tears down immediately — releases any restricted toolset, clears the
    // active config so the agent-block hook goes inert, and flips the status line to ⏸ —
    // so the effect is visible now, not only on the next prompt.
    off: async (_arg, _rest, _sub, ctx) => {
      routingEnabled = false;
      if (baselineTools !== null) {
        await pi.setActiveTools(baselineTools);
        baselineTools = null;
      }
      active = null;
      ctx.ui.setStatus("profile", "⏸ off");
      ctx.ui.notify("Profile routing OFF — prompts pass through untouched (model, tools, thinking, rules). /profile on to resume.", "info");
    },

    // ---- /profile on : resume routing ----
    on: (_arg, _rest, _sub, ctx) => {
      routingEnabled = true;
      ctx.ui.notify("Profile routing ON — resumes on the next prompt.", "info");
    },

    // ---- /profile validate : structural check of bundles.json ----
    validate: (_arg, _rest, _sub, ctx) => {
      const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
      const problems = validateBundles(bundles);
      if (problems.length === 0) {
        ctx.ui.notify(`✓ bundles.json valid (${bundles.profiles.length} profile${bundles.profiles.length === 1 ? "" : "s"})`, "info");
      } else {
        ctx.ui.notify(`✗ bundles.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n${problems.map((p) => `  - ${p}`).join("\n")}`, "warning");
      }
    },

    // ---- /profile explain <text> : show routing trace for a prompt without sending it ----
    explain: (arg, _rest, sub, ctx) => {
      const text = arg.slice(sub.length).trim();
      if (!text) {
        ctx.ui.notify("Usage: /profile explain <prompt text>", "warning");
        return;
      }
      const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
      const rows = explain(text, bundles);
      const headerText = `🔎 Profile routing for "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`;
      const lines = [headerText, ...formatTraceLines(rows)];
      ctx.ui.notify(lines.join("\n"), "info");
    },

    // ---- /profile stats : session counters ----
    stats: (_arg, _rest, _sub, ctx) => {
      const hasActivity =
        promptsClassified.size > 0 ||
        manualPinsSet > 0 ||
        modelSwitchesAccepted > 0 ||
        modelSwitchesDeclined > 0 ||
        modelSwitchesAuto > 0;

      if (!hasActivity) {
        ctx.ui.notify("no prompts classified yet", "info");
        return;
      }

      const lines: string[] = ["Profile stats (this session):"];

      // Build and sort profiles by count descending
      const profileStats = Array.from(promptsClassified.entries()).sort((a, b) => b[1] - a[1]);
      for (const [name, count] of profileStats) {
        lines.push(`  ${name}: ${count}`);
      }

      lines.push(`Manual pins set: ${manualPinsSet}`);
      lines.push(`Model switches accepted: ${modelSwitchesAccepted}`);
      lines.push(`Model switches declined: ${modelSwitchesDeclined}`);
      lines.push(`Model downgrades auto-applied (no confirm): ${modelSwitchesAuto}`);

      ctx.ui.notify(lines.join("\n"), "info");
    },

    // ---- /profile decisions [reset] : inspect or clear remembered model-switch answers ----
    // Remembered answers are otherwise invisible: a switch you once declined simply stops
    // being offered, with nothing in the UI to say why. This makes the map inspectable and
    // resettable without hand-editing .omp/model-decisions.json.
    decisions: (_arg, rest, _sub, ctx) => {
      loadPersistedDecisions(ctx.cwd);
      if ((rest[0] ?? "").toLowerCase() === "reset") {
        const cleared = modelDecisions.size;
        modelDecisions.clear();
        persistDecisions(ctx.cwd);
        ctx.ui.notify(
          `Cleared ${cleared} remembered model decision${cleared === 1 ? "" : "s"} — the next switch will ask again`,
          "info",
        );
        return;
      }
      if (modelDecisions.size === 0) {
        ctx.ui.notify("No remembered model decisions yet (they persist in .omp/model-decisions.json)", "info");
        return;
      }
      const lines = [`Remembered model decisions (${modelDecisions.size}) — /profile decisions reset to clear:`];
      for (const [key, approved] of modelDecisions) {
        lines.push(`  ${approved ? "✓ accept" : "✗ decline"}  ${key}`);
      }
      lines.push("Downgrades (strictly cheaper on both input and output) bypass this map and apply automatically.");
      ctx.ui.notify(lines.join("\n"), "info");
    },

    // ---- /profile rules : print the exact rules/skills block being injected ----
    rules: (_arg, _rest, _sub, ctx) => {
      if (active === null) {
        ctx.ui.notify("No classification yet — send a prompt first", "info");
        return;
      }
      const block = buildInjectionBlock(active);
      if (block === null) {
        ctx.ui.notify(
          `No rules or skills declared for the active profile (${active.matched.map((m) => m.name).join("+") || "default"})`,
          "info",
        );
        return;
      }
      ctx.ui.notify(block, "info");
    },

    // ---- /profile telemetry : summarize the routing log for vocabulary tuning ----
    telemetry: (_arg, _rest, _sub, ctx) => {
      const logPath = path.join(ctx.cwd, ".profile-router-telemetry.log");
      if (!fs.existsSync(logPath)) {
        ctx.ui.notify("No telemetry recorded yet (.profile-router-telemetry.log missing)", "info");
        return;
      }
      type TelemetryRow = {
        prompt: string;
        chosenProfile: string;
        margin: number;
        runnerUpProfile: string | null;
        model?: string | null;
        thinkingLevel?: string | null;
      };
      const rows: TelemetryRow[] = [];
      for (const line of fs.readFileSync(logPath, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          rows.push(JSON.parse(trimmed) as TelemetryRow);
        } catch {
          // Skip corrupt lines — the log is append-only and may interleave across sessions.
        }
      }
      if (rows.length === 0) {
        ctx.ui.notify("Telemetry log exists but has no readable entries", "info");
        return;
      }
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.chosenProfile, (counts.get(r.chosenProfile) ?? 0) + 1);
      const lines: string[] = [`Telemetry (${rows.length} route${rows.length === 1 ? "" : "s"} in .profile-router-telemetry.log):`];
      for (const [name, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${name}: ${count}`);
      }
      // Routes-by-model: the spend view. Profile counts say whether routing was right;
      // this says what it cost. Rows predating the `model` field count as "unrecorded"
      // rather than being dropped, so an upgraded log still summarises cleanly.
      const modelCounts = new Map<string, number>();
      for (const r of rows) {
        const m = r.model ?? "(unrecorded)";
        modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);
      }
      lines.push("Routes by model:");
      for (const [model, count] of [...modelCounts.entries()].sort((a, b) => b[1] - a[1])) {
        const pct = Math.round((count / rows.length) * 100);
        lines.push(`  ${model}: ${count} (${pct}%)`);
      }

      const defaultCount = counts.get("default") ?? 0;
      if (defaultCount > 0) {
        lines.push(`${defaultCount} default route${defaultCount === 1 ? "" : "s"} — prompts the vocabulary missed; review them for new keywords`);
      }
      // Low-margin routes are the ones one stray keyword away from flipping profile.
      const lowMargin = rows.filter((r) => typeof r.margin === "number" && r.margin <= 1);
      lines.push(`Low-margin routes (margin <= 1): ${lowMargin.length}`);
      for (const r of lowMargin.slice(-5)) {
        const promptPreview = r.prompt.length > 60 ? `${r.prompt.slice(0, 60)}…` : r.prompt;
        lines.push(`  [${r.margin >= 0 ? "+" : ""}${r.margin}] ${r.chosenProfile}${r.runnerUpProfile ? ` vs ${r.runnerUpProfile}` : ""}: "${promptPreview}"`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },

    // ---- /profile misroute [expected-profile] : log misclassifications to .omp/misroutes.jsonl ----
    misroute: (_arg, rest, _sub, ctx) => {
      if (!lastPrompt) {
        ctx.ui.notify("nothing to log", "warning");
        return;
      }
      const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
      const expectedArg = rest.join(" ").trim() || null;

      // Validate expected-profile argument if provided
      if (expectedArg && !bundles.profiles.some((p) => p.name === expectedArg)) {
        ctx.ui.notify(
          `No profile named "${expectedArg}" in bundles.json. Known: ${bundles.profiles.map((p) => p.name).join(", ") || "(none loaded)"}`,
          "error",
        );
        return;
      }

      // Create .omp directory if needed and append the JSON line
      const ompDir = path.join(ctx.cwd, ".omp");
      fs.mkdirSync(ompDir, { recursive: true });
      const logPath = path.join(ompDir, "misroutes.jsonl");

      const entry = {
        ts: new Date().toISOString(),
        prompt: lastPrompt.slice(0, 500),
        matched: active?.matched.map((m) => m.name) ?? [],
        expected: expectedArg,
      };

      fs.appendFileSync(logPath, JSON.stringify(entry) + "\n");
      ctx.ui.notify(`Logged misroute to ${logPath}`, "info");
    },
  };

  // ---- Manual override + status ----
  pi.registerCommand("profile", {
    description:
      "Status/override: /profile [<name> [--once]|clear] | off | on | list | debug [on|off] | validate | explain <text> | stats | rules | telemetry | decisions [reset] | misroute [expected]",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim();
      const [sub, ...rest] = arg.split(/\s+/);

      if (arg === "clear") {
        manualOverride = null;
        manualOverrideOnce = false;
        stickyPrevProfile = null;
        ctx.ui.notify("Profile override cleared — auto-classification resumed", "info");
        return;
      }

      // ---- Named subcommands (list/debug/validate/explain/stats/rules/telemetry/misroute) ----
      // Checked before the --once regex and the <name> pin, so a subcommand name shadows an
      // identically-named profile — matching the original if-chain's ordering exactly.
      const subKey = sub ?? "";
      const subHandler = SUBCOMMANDS[subKey];
      if (subHandler) {
        await subHandler(arg, rest, subKey, ctx);
        return;
      }

      // ---- /profile <name> --once : turn-scoped pin, auto-clears after one prompt ----
      const onceMatch = /^(.+?)\s+--once$/.exec(arg);
      if (onceMatch) {
        const name = onceMatch[1]!;
        const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
        if (!bundles.profiles.some((p) => p.name === name)) {
          ctx.ui.notify(`No profile named "${name}" in bundles.json. Known: ${bundles.profiles.map((p) => p.name).join(", ") || "(none loaded)"}`, "error");
          return;
        }
        manualOverride = name;
        manualOverrideOnce = true;
        stickyPrevProfile = null;
        manualPinsSet++;
        ctx.ui.notify(`Profile pinned to "${name}" for the next prompt only (--once)`, "info");
        return;
      }

      if (arg) {
        const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
        if (!bundles.profiles.some((p) => p.name === arg)) {
          ctx.ui.notify(`No profile named "${arg}" in bundles.json. Known: ${bundles.profiles.map((p) => p.name).join(", ") || "(none loaded)"}`, "error");
          return;
        }
        manualOverride = arg;
        manualOverrideOnce = false;
        stickyPrevProfile = null;
        manualPinsSet++;
        ctx.ui.notify(`Profile pinned to "${arg}" until /profile clear`, "info");
        return;
      }
      if (!routingEnabled) {
        ctx.ui.notify("Profile routing is OFF (/profile on to resume). Prompts pass through untouched.", "info");
        return;
      }
      const pendingNote = manualOverrideOnce ? `\nPending once-pin: ${manualOverride} (applies to the next prompt only)` : "";
      ctx.ui.notify(
        (active
          ? `Active: ${active.matched.map((m) => `${m.name}(${m.score})`).join(", ") || "default"}\n` +
          `Model: ${modelStr(active.model)} | Thinking: ${active.thinkingLevel ?? "unset"} | Disabled agents: ${active.disabledAgents.join(", ") || "none"}`
          : "No classification yet — send a prompt first") + pendingNote,
        "info",
      );
    },
  });
}
