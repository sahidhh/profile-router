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

// ---------- Types (mirror bundles.json schema) ----------

export interface Profile {
  name: string;
  description?: string;         // one-line human summary (display only; never affects classification)
  keywords: string[];          // classifier terms
  rules?: string[];            // injected into system prompt
  skills?: string[];           // union
  tools?: string[];            // union
  disabledAgents?: string[];   // INTERSECTION across matched profiles
  model?: string | string[];   // single-value: highest score wins; array = fallback chain, first resolvable wins
  thinkingLevel?: string;      // single-value: highest score wins
}

export interface Bundles {
  profiles: Profile[];         // declaration order = tiebreak order
  default?: Partial<Profile>;
}

export interface MergedConfig {
  matched: { name: string; score: number }[];
  rules: string[];
  skills: string[];
  tools: string[];
  disabledAgents: string[];
  model?: string | string[];
  thinkingLevel?: string;
}

const DEBUG = process.env.PROFILE_ROUTER_DEBUG === "1";

// ---------- Config loading (project-local overrides global) ----------

/** Tracks whether we've already warned about a malformed/missing config this process, per path. */
const warnedPaths = new Set<string>();

export function loadBundles(cwd: string, notify?: (msg: string) => void): Bundles {
  const candidates = [path.join(cwd, ".omp", "bundles.json"), path.join(os.homedir(), ".omp", "bundles.json")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as Bundles;
      if (!parsed || !Array.isArray(parsed.profiles)) {
        throw new Error("bundles.json must have a top-level \"profiles\" array");
      }
      return parsed;
    } catch (err) {
      if (!warnedPaths.has(p)) {
        warnedPaths.add(p);
        notify?.(`profile-router: failed to parse ${p} (${(err as Error).message}) — continuing with no profiles`);
      }
      return { profiles: [] };
    }
  }
  return { profiles: [] };
}

// ---------- Classification (keyword scoring, word-boundary matching) ----------

/**
 * Score a single profile against already-lowercased prompt text.
 * Records WHICH keywords claimed a span (not just the count) so the same logic
 * powers both classify() (score only) and explain() (score + matched keywords).
 */
export function scoreProfile(text: string, profile: Profile): { score: number; matched: string[] } {
  // Claimed text spans, so a longer phrase (e.g. "code review") and a shorter
  // keyword it contains (e.g. "review") can't both score off the same words.
  const claimed: [number, number][] = [];
  const overlapsClaimed = (start: number, end: number) => claimed.some(([s, e]) => start < e && s < end);
  const matched: string[] = [];

  const byLengthDesc = [...profile.keywords].sort((a, b) => b.length - a.length);
  for (const kw of byLengthDesc) {
    // Word-boundary match beats naive substring ("fix" shouldn't hit "prefix").
    const re = new RegExp(`\\b${kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (!overlapsClaimed(start, end)) {
        claimed.push([start, end]);
        matched.push(kw);
        break;
      }
    }
  }
  return { score: matched.length, matched };
}

export function classify(prompt: string, bundles: Bundles): { profile: Profile; score: number }[] {
  const text = prompt.toLowerCase();
  const hits: { profile: Profile; score: number; order: number }[] = [];

  bundles.profiles.forEach((profile, order) => {
    const { score } = scoreProfile(text, profile);
    if (score > 0) hits.push({ profile, score, order });
  });

  // Sort: score desc, then declaration order asc (tiebreak rule)
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
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
      union(cfg.rules, bundles.default.rules);
      union(cfg.skills, bundles.default.skills);
      union(cfg.tools, bundles.default.tools);
      cfg.disabledAgents = bundles.default.disabledAgents ?? [];
    }
    cfg.model = bundles.default?.model;
    cfg.thinkingLevel = bundles.default?.thinkingLevel;
    return cfg;
  }

  // disabledAgents: intersection — any matched profile that leaves an agent
  // enabled keeps it enabled overall.
  let disabled: Set<string> | null = null;
  for (const { profile } of matches) {
    union(cfg.rules, profile.rules);
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
    if (p.thinkingLevel !== undefined && !VALID_THINKING_LEVELS.includes(p.thinkingLevel)) {
      problems.push(`${label}: thinkingLevel "${p.thinkingLevel}" is not one of ${VALID_THINKING_LEVELS.join("/")}`);
    }
    if (
      p.model !== undefined &&
      !(typeof p.model === "string" || (Array.isArray(p.model) && p.model.every((m) => typeof m === "string")))
    ) {
      problems.push(`${label}: "model" must be a string or an array of strings`);
    }
  });

  return problems;
}

// ---------- Extension ----------

export default function (pi: ExtensionAPI) {
  let active: MergedConfig | null = null;
  let manualOverride: string | null = null;        // set via /profile <name>
  let lastPrompt: string | null = null;             // tracks last classified prompt for /profile misroute
  let debugTrace = false;                          // toggled via /profile debug on|off
  const modelDecisions = new Map<string, boolean>(); // "from→to" -> user's answer, for this session
  const unresolvedModelWarned = new Set<string>();   // model strings already warned about this session
  const promptsClassified = new Map<string, number>(); // profile name (or "default") -> count
  let manualPinsSet = 0;
  let modelSwitchesAccepted = 0;
  let modelSwitchesDeclined = 0;

  const debugLog = (msg: string, context?: Record<string, unknown>) => {
    if (DEBUG) pi.logger.debug(`[profile-router] ${msg}`, context);
  };

  // ---- Every prompt: classify, merge, inject ----
  pi.on("before_agent_start", async (event, ctx) => {
    const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
    lastPrompt = event.prompt;

    let matches = classify(event.prompt, bundles);
    let overrideApplied = false;

    if (manualOverride) {
      const p = bundles.profiles.find((x) => x.name === manualOverride);
      if (p) {
        matches = [{ profile: p, score: Number.POSITIVE_INFINITY }];
        overrideApplied = true;
      } else {
        // The pinned profile no longer exists (renamed/removed in bundles.json).
        // Clear the stale pin rather than silently falling back to auto-classification
        // while still labeling it as manually overridden.
        ctx.ui.notify(`Profile override "${manualOverride}" no longer exists — clearing pin, resuming auto-classification`, "warning");
        manualOverride = null;
      }
    }

    const next = merge(matches, bundles);
    active = next;

    // Increment promptsClassified counter for each matched profile, or "default" if none matched
    const namesToCount = next.matched.length ? next.matched.map((m) => m.name) : ["default"];
    for (const n of namesToCount) promptsClassified.set(n, (promptsClassified.get(n) ?? 0) + 1);

    debugLog("classified", { prompt: event.prompt.slice(0, 80), matched: next.matched });

    // ---- Debug trace: explain WHY this prompt routed where it did (toggled via /profile debug) ----
    if (debugTrace) {
      const lines: string[] = [`🔎 Profile routing for "${event.prompt.slice(0, 60)}${event.prompt.length > 60 ? "…" : ""}"`];
      if (overrideApplied) {
        lines.push(`  → ${manualOverride} (manual pin — classification bypassed)`);
      } else {
        const rows = explain(event.prompt, bundles);
        lines.push(...formatTraceLines(rows));
      }
      ctx.ui.notify(lines.join("\n"), "info");
    }

    // Status line: ALWAYS visible so misclassification is caught before damage.
    ctx.ui.setStatus(
      "profile",
      next.matched.length
        ? `⚙ ${next.matched.map((m) => m.name).join("+")}${overrideApplied ? " (manual)" : ""}`
        : "⚙ default",
    );

    // ---- Model routing: suggest + confirm, only on actual change ----
    // `model` may be a fallback chain (["openrouter/...", "anthropic/..."]) —
    // the first spec that resolves against a credentialed provider wins.
    if (next.model) {
      const candidates = Array.isArray(next.model) ? next.model : [next.model];
      let resolved: ReturnType<typeof ctx.models.resolve>;
      let resolvedSpec: string | undefined;
      for (const spec of candidates) {
        resolved = ctx.models.resolve(spec);
        if (resolved) {
          resolvedSpec = spec;
          break;
        }
      }
      const current = ctx.model;
      if (resolved) {
        const changed = !current || resolved.id !== current.id || resolved.provider !== current.provider;
        if (changed) {
          const key = `${current ? `${current.provider}/${current.id}` : "?"}→${resolved.provider}/${resolved.id}`;
          let approved = modelDecisions.get(key);
          if (approved === undefined) {
            approved = await ctx.ui.confirm(
              "Switch model?",
              `Profile "${next.matched.map((m) => m.name).join("+") || "default"}" suggests ${resolved.provider}/${resolved.id} (current: ${current ? `${current.provider}/${current.id}` : "unknown"})`,
            );
            modelDecisions.set(key, approved);
          }
          if (approved) {
            modelSwitchesAccepted++;
            const ok = await pi.setModel(resolved);
            if (!ok) {
              ctx.ui.notify(`No credentials available for ${resolved.provider}/${resolved.id} — run /model ${resolvedSpec} manually`, "warning");
            }
          } else {
            modelSwitchesDeclined++;
          }
        }
      } else {
        const warnKey = candidates.join(", ");
        if (!unresolvedModelWarned.has(warnKey)) {
          unresolvedModelWarned.add(warnKey);
          const profileNames = next.matched.map((m) => m.name).join("+") || "default";
          ctx.ui.notify(`Profile "${profileNames}" references model${candidates.length > 1 ? "s" : ""} "${warnKey}" — none could be resolved, continuing with the current model`, "warning");
        }
        debugLog("model not resolvable", { model: warnKey });
      }
    }

    // ---- Thinking level: applied silently (no confirm — session generation parameter, not a cost switch) ----
    if (next.thinkingLevel) {
      pi.setThinkingLevel(next.thinkingLevel as Parameters<typeof pi.setThinkingLevel>[0]);
    }

    // ---- Active tools: only restrict when the merged profile set actually specifies a tool list.
    // An empty union (default / no profile declares `tools`) leaves the current toolset untouched
    // so a no-match prompt never silently strips bash/edit/write.
    if (next.tools.length > 0) {
      await pi.setActiveTools(next.tools);
    }

    // ---- Rules injection into system prompt for this agent run ----
    const block = buildInjectionBlock(next);
    if (block) {
      return { systemPrompt: [...event.systemPrompt, block] };
    }
    // Silent when profile unchanged and no rules — zero UI noise.
  });

  // ---- session.compacting fires mid-run when the agent auto-compacts context. before_agent_start
  // already re-injects the merged rules block into systemPrompt on every new prompt — this handler
  // only covers the case where compaction happens *between* prompts, mid-turn, so a long agentic
  // run doesn't silently lose the active rules when older messages get summarized away.
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

  const modelStr = (m?: string | string[]) => (m ? (Array.isArray(m) ? m.join(" → ") : m) : "unset");

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
    }
    const zero = rows.length - scored.length;
    if (zero > 0) lines.push(`  (${zero} other profile${zero === 1 ? "" : "s"} scored 0)`);
    return lines;
  };

  // ---- Manual override + status ----
  pi.registerCommand("profile", {
    description:
      "Status/override: /profile [<name>|clear] | list | debug [on|off] | validate | explain <text>",
    handler: async (args, ctx) => {
      const arg = (args ?? "").trim();
      const [sub, ...rest] = arg.split(/\s+/);

      if (arg === "clear") {
        manualOverride = null;
        ctx.ui.notify("Profile override cleared — auto-classification resumed", "info");
        return;
      }

      // ---- /profile list : every profile with its one-line summary ----
      if (sub === "list") {
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
        return;
      }

      // ---- /profile debug [on|off] : toggle the per-request routing trace ----
      if (sub === "debug") {
        const mode = (rest[0] ?? "").toLowerCase();
        if (mode === "on") debugTrace = true;
        else if (mode === "off") debugTrace = false;
        else debugTrace = !debugTrace; // bare `/profile debug` toggles
        ctx.ui.notify(
          `Profile debug trace ${debugTrace ? "ON — each prompt will show why a profile is chosen" : "OFF"}`,
          "info",
        );
        return;
      }

      // ---- /profile validate : structural check of bundles.json ----
      if (sub === "validate") {
        const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
        const problems = validateBundles(bundles);
        if (problems.length === 0) {
          ctx.ui.notify(`✓ bundles.json valid (${bundles.profiles.length} profile${bundles.profiles.length === 1 ? "" : "s"})`, "info");
        } else {
          ctx.ui.notify(`✗ bundles.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}:\n${problems.map((p) => `  - ${p}`).join("\n")}`, "warning");
        }
        return;
      }

      // ---- /profile explain <text> : show routing trace for a prompt without sending it ----
      if (sub === "explain") {
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
        return;
      }

      // ---- /profile stats : session counters ----
      if (sub === "stats") {
        const hasActivity =
          promptsClassified.size > 0 || manualPinsSet > 0 || modelSwitchesAccepted > 0 || modelSwitchesDeclined > 0;

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

        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      // ---- /profile rules : print the exact rules/skills block being injected ----
      if (sub === "rules") {
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
        return;
      }

      // ---- /profile misroute [expected-profile] : log misclassifications to .omp/misroutes.jsonl ----
      if (sub === "misroute") {
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
        return;
      }

      if (arg) {
        const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
        if (!bundles.profiles.some((p) => p.name === arg)) {
          ctx.ui.notify(`No profile named "${arg}" in bundles.json. Known: ${bundles.profiles.map((p) => p.name).join(", ") || "(none loaded)"}`, "error");
          return;
        }
        manualOverride = arg;
        manualPinsSet++;
        ctx.ui.notify(`Profile pinned to "${arg}" until /profile clear`, "info");
        return;
      }
      ctx.ui.notify(
        active
          ? `Active: ${active.matched.map((m) => `${m.name}(${m.score})`).join(", ") || "default"}\n` +
              `Model: ${modelStr(active.model)} | Thinking: ${active.thinkingLevel ?? "unset"} | Disabled agents: ${active.disabledAgents.join(", ") || "none"}`
          : "No classification yet — send a prompt first",
        "info",
      );
    },
  });
}
