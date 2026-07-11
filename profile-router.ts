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
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------- Types (mirror bundles.json schema) ----------

export interface Profile {
  name: string;
  keywords: string[];          // classifier terms. Empty = a "class" build: never auto-matched, only reachable via /equip (manual override).
  rules?: string[];            // injected into system prompt
  skills?: string[];           // union
  tools?: string[];            // union
  disabledAgents?: string[];   // INTERSECTION across matched profiles
  disabledTools?: string[];    // UNION across matched profiles (restrictive: any matched profile blocking a tool wins) — the Sentinel oath
  maxMinions?: number;         // cap on live `task` subagents (MIN across matched profiles) — the Monarch summon cap
  noConfirm?: boolean;         // auto-accept model switches without a confirm dialog (OR across matched) — the Berserker flag
  model?: string;              // single-value: highest score wins
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
  disabledTools: string[];
  maxMinions?: number;
  noConfirm: boolean;
  model?: string;
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

/**
 * Resolve which bundles.json path is authoritative for WRITES (e.g. /arise persistence).
 * Mirrors loadBundles' read precedence: an existing project-local file wins, else an
 * existing global file, else the project-local path (so a first write creates it there).
 */
export function resolveBundlesPath(cwd: string): string {
  const project = path.join(cwd, ".omp", "bundles.json");
  const global = path.join(os.homedir(), ".omp", "bundles.json");
  if (fs.existsSync(project)) return project;
  if (fs.existsSync(global)) return global;
  return project;
}

// ---------- Classification (keyword scoring, word-boundary matching) ----------

export function classify(prompt: string, bundles: Bundles): { profile: Profile; score: number }[] {
  const text = prompt.toLowerCase();
  const hits: { profile: Profile; score: number; order: number }[] = [];

  bundles.profiles.forEach((profile, order) => {
    let score = 0;
    // Claimed text spans, so a longer phrase (e.g. "code review") and a shorter
    // keyword it contains (e.g. "review") can't both score off the same words.
    const claimed: [number, number][] = [];
    const overlapsClaimed = (start: number, end: number) => claimed.some(([s, e]) => start < e && s < end);

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
          score += 1;
          break;
        }
      }
    }
    if (score > 0) hits.push({ profile, score, order });
  });

  // Sort: score desc, then declaration order asc (tiebreak rule)
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return hits.map(({ profile, score }) => ({ profile, score }));
}

// ---------- Merge (union / intersection / highest-score) ----------

export function merge(matches: { profile: Profile; score: number }[], bundles: Bundles): MergedConfig {
  const cfg: MergedConfig = {
    matched: matches.map((m) => ({ name: m.profile.name, score: m.score })),
    rules: [],
    skills: [],
    tools: [],
    disabledAgents: [],
    disabledTools: [],
    noConfirm: false,
  };

  const union = (target: string[], src?: string[]) => {
    for (const item of src ?? []) if (!target.includes(item)) target.push(item);
  };
  // maxMinions merges as MIN: the most restrictive summon cap among matched profiles wins.
  const tightenCap = (current: number | undefined, next: number | undefined) =>
    next === undefined ? current : current === undefined ? next : Math.min(current, next);

  if (matches.length === 0) {
    // Fallback to default profile when nothing matched.
    if (bundles.default) {
      union(cfg.rules, bundles.default.rules);
      union(cfg.skills, bundles.default.skills);
      union(cfg.tools, bundles.default.tools);
      union(cfg.disabledTools, bundles.default.disabledTools);
      cfg.disabledAgents = bundles.default.disabledAgents ?? [];
      cfg.maxMinions = bundles.default.maxMinions;
      cfg.noConfirm = bundles.default.noConfirm ?? false;
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
    // disabledTools: UNION — opposite of disabledAgents. A block is a safety oath;
    // a co-matched permissive profile must never be able to dilute it.
    union(cfg.disabledTools, profile.disabledTools);
    cfg.maxMinions = tightenCap(cfg.maxMinions, profile.maxMinions);
    if (profile.noConfirm) cfg.noConfirm = true;
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

// ---------- Extension ----------

export default function (pi: ExtensionAPI) {
  let active: MergedConfig | null = null;
  let manualOverride: string | null = null;        // set via /profile | /equip <name>
  const modelDecisions = new Map<string, boolean>(); // "from→to" -> user's answer, for this session
  const unresolvedModelWarned = new Set<string>();   // model strings already warned about this session
  const poisonedProviders = new Set<string>();       // providers whose credential got soft-disabled → running on fallback
  let liveSummons = 0;                               // in-flight `task` subagents this gate (Monarch summon cap)
  const gatesCleared = new Map<string, number>();    // Hunter Rank: prompts routed, per class/profile label
  let bossesFought = 0;                              // Hunter Rank: high/max-thinking gates entered

  const debugLog = (msg: string, context?: Record<string, unknown>) => {
    if (DEBUG) pi.logger.debug(`[profile-router] ${msg}`, context);
  };

  // ---- Every prompt: classify, merge, inject ----
  pi.on("before_agent_start", async (event, ctx) => {
    const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));

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

    // A new gate: the previous gate's summons are dismissed. Reset before enforcing the cap.
    liveSummons = 0;

    // Hunter Rank (in-session, flavor): tally which class/profile cleared this gate.
    const rankLabel = next.matched.map((m) => m.name).join("+") || "default";
    gatesCleared.set(rankLabel, (gatesCleared.get(rankLabel) ?? 0) + 1);
    if (next.thinkingLevel === "high" || next.thinkingLevel === "xhigh" || next.thinkingLevel === "max") bossesFought += 1;

    debugLog("classified", { prompt: event.prompt.slice(0, 80), matched: next.matched });

    // Status line: ALWAYS visible so misclassification is caught before damage.
    ctx.ui.setStatus(
      "profile",
      next.matched.length
        ? `⚙ ${next.matched.map((m) => m.name).join("+")}${overrideApplied ? " (manual)" : ""}`
        : "⚙ default",
    );

    // ---- Model routing: suggest + confirm, only on actual change ----
    if (next.model) {
      const resolved = ctx.models.resolve(next.model);
      const current = ctx.model;
      const changed = resolved && (!current || resolved.id !== current.id || resolved.provider !== current.provider);
      if (resolved && changed) {
        const key = `${current ? `${current.provider}/${current.id}` : "?"}→${resolved.provider}/${resolved.id}`;
        let approved = modelDecisions.get(key);
        if (approved === undefined) {
          if (next.noConfirm) {
            // Berserker: asks nothing, confirms nothing. Auto-accept the switch.
            approved = true;
            ctx.ui.notify(`⚔ Berserker: switching to ${resolved.provider}/${resolved.id} without confirmation`, "info");
          } else {
            approved = await ctx.ui.confirm(
              "Switch model?",
              `Profile "${next.matched.map((m) => m.name).join("+") || "default"}" suggests ${resolved.provider}/${resolved.id} (current: ${current ? `${current.provider}/${current.id}` : "unknown"})`,
            );
          }
          modelDecisions.set(key, approved);
        }
        if (approved) {
          const ok = await pi.setModel(resolved);
          if (!ok) {
            ctx.ui.notify(`No credentials available for ${resolved.provider}/${resolved.id} — run /model ${next.model} manually`, "warning");
          }
        }
      } else if (!resolved) {
        if (!unresolvedModelWarned.has(next.model)) {
          unresolvedModelWarned.add(next.model);
          const profileNames = next.matched.map((m) => m.name).join("+") || "default";
          ctx.ui.notify(`Profile "${profileNames}" references model "${next.model}" which could not be resolved — continuing with the current model`, "warning");
        }
        debugLog("model not resolvable", { model: next.model });
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
    const parts: string[] = [];
    if (next.rules.length > 0) {
      parts.push(
        `## Active Engineering Rules (${next.matched.map((m) => m.name).join("+") || "default"})\n` +
          next.rules.map((r) => `- ${r}`).join("\n"),
      );
    }
    if (next.skills.length > 0) {
      parts.push(`## Recommended Skills\n${next.skills.map((s) => `- ${s}`).join("\n")}`);
    }
    if (parts.length > 0) {
      return { systemPrompt: [...event.systemPrompt, parts.join("\n\n")] };
    }
    // Silent when profile unchanged and no rules — zero UI noise.
  });

  // ---- Enforce disabledTools (Sentinel oath), disabledAgents, and the Monarch summon cap ----
  pi.on("tool_call", async (event) => {
    if (!active) return;
    const label = active.matched.map((m) => m.name).join("+") || "default";

    // Sentinel: a blocked tool is a hard oath — the class physically cannot invoke it.
    if (active.disabledTools.includes(event.toolName)) {
      return { block: true, reason: `Tool "${event.toolName}" is forbidden by the ${label} oath (disabledTools)` };
    }

    if (event.toolName !== "task") return;

    // disabledAgents: any matched profile that leaves an agent enabled keeps it enabled (intersection, computed in merge()).
    const target = String((event.input as Record<string, unknown>)?.agent ?? "task");
    if (active.disabledAgents.includes(target)) {
      return { block: true, reason: `Agent "${target}" disabled by profile ${label}` };
    }

    // Monarch summon cap: block the (maxMinions+1)-th live summon.
    if (active.maxMinions !== undefined && liveSummons >= active.maxMinions) {
      return {
        block: true,
        reason: `Your army is at its limit, Monarch — ${liveSummons}/${active.maxMinions} summons already live. Wait for one to return.`,
      };
    }
    // Reserve a slot the moment the summon is approved (before execution), so a burst of
    // task calls in one turn can't all read a stale count of 0. Released on execution end;
    // hard-reset each gate in before_agent_start so a lost end-event can't leak permanently.
    liveSummons += 1;
  });

  // ---- Release a summon slot when a `task` subagent finishes (Monarch) ----
  pi.on("tool_execution_end", async (event) => {
    if (event.toolName === "task" && liveSummons > 0) liveSummons -= 1;
  });

  // ---- 🔥 Embers: re-inject active oaths into the compaction summary so guardrails survive it ----
  // The dungeon eats memory; without this, the rules injected per-gate silently vanish on compaction.
  pi.on("session.compacting", async (_event, ctx) => {
    if (!active || active.rules.length === 0) return;
    const label = active.matched.map((m) => m.name).join("+") || "default";
    ctx.ui.notify("🔥 Ember restored — oaths carried through compaction", "info");
    return {
      context: [
        `Active engineering rules (${label}) — these MUST remain in force after compaction:`,
        ...active.rules.map((r) => `- ${r}`),
      ],
    };
  });

  // ---- 🩸 Poison: surface silent provider fallback so you never unknowingly run on the backup ----
  pi.on("credential_disabled", async (event, ctx) => {
    poisonedProviders.add(event.provider);
    ctx.ui.setStatus("poison", `☠ fallback: ${[...poisonedProviders].join(", ")} disabled`);
    ctx.ui.notify(
      `☠ Poisoned — credential for "${event.provider}" was disabled; you are now on a fallback model. Cause: ${event.disabledCause}`,
      "warning",
    );
  });

  // ---- Manual override (pin/clear), shared by /profile and its flavored alias /equip ----
  const setOverride = (arg: string, ctx: ExtensionCommandContext, verb: string): void => {
    if (arg === "clear") {
      manualOverride = null;
      ctx.ui.notify(`${verb} cleared — auto-classification resumed`, "info");
      return;
    }
    if (arg) {
      const bundles = loadBundles(ctx.cwd, (msg) => ctx.ui.notify(msg, "warning"));
      if (!bundles.profiles.some((p) => p.name === arg)) {
        ctx.ui.notify(`No profile named "${arg}" in bundles.json. Known: ${bundles.profiles.map((p) => p.name).join(", ") || "(none loaded)"}`, "error");
        return;
      }
      manualOverride = arg;
      ctx.ui.notify(`${verb} "${arg}" until cleared`, "info");
      return;
    }
    ctx.ui.notify(
      active
        ? `Active: ${active.matched.map((m) => `${m.name}(${m.score})`).join(", ") || "default"}\n` +
            `Model: ${active.model ?? "unset"} | Thinking: ${active.thinkingLevel ?? "unset"} | ` +
            `Disabled agents: ${active.disabledAgents.join(", ") || "none"} | Blocked tools: ${active.disabledTools.join(", ") || "none"} | ` +
            `Summon cap: ${active.maxMinions ?? "∞"}`
        : "No classification yet — send a prompt first",
      "info",
    );
  };

  pi.registerCommand("profile", {
    description: "Show active profile, or override: /profile <name> | /profile clear",
    handler: async (args, ctx) => setOverride((args ?? "").trim(), ctx, "Profile pinned to"),
  });

  // /equip <class> — flavored alias for the same manual-override machinery (classes are keyword-less profiles).
  pi.registerCommand("equip", {
    description: "Equip a class build (Wretch/Vanguard/Archmage/Monarch/Sentinel/Berserker …): /equip <name> | /equip clear",
    handler: async (args, ctx) => setOverride((args ?? "").trim(), ctx, "Equipped"),
  });

  // ---- 🗡 /arise — Shadow Extraction: distill ONE battle-learned rule, approve, persist ----
  pi.registerCommand("arise", {
    description: "Shadow Extraction: /arise (ask the model to distill one rule) | /arise <profile> <rule text> (persist it)",
    handler: async (args, ctx) => {
      const trimmed = (args ?? "").trim();
      if (!trimmed) {
        pi.sendUserMessage(
          "Distill exactly ONE reusable engineering rule from the work in this session — a single imperative sentence of the kind that belongs in a profile's rules list. Output only that one sentence, nothing else.",
          { deliverAs: "followUp" },
        );
        ctx.ui.notify('🗡 ARISE — asking the current model to distill one shadow. Then persist it with: /arise <profile> <that rule>', "info");
        return;
      }
      const sp = trimmed.search(/\s/);
      if (sp < 0) {
        ctx.ui.notify('Usage: /arise <profile> <rule text> — e.g. /arise implementation "Prefer the framework\'s native facility over a custom abstraction."', "error");
        return;
      }
      const profileName = trimmed.slice(0, sp);
      const rule = trimmed.slice(sp + 1).trim().replace(/^["']|["']$/g, "");
      if (!rule) {
        ctx.ui.notify("No rule text provided after the profile name.", "error");
        return;
      }
      const bundlesPath = resolveBundlesPath(ctx.cwd);
      let parsed: Bundles;
      try {
        parsed = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;
      } catch (err) {
        ctx.ui.notify(`Cannot read ${bundlesPath}: ${(err as Error).message}`, "error");
        return;
      }
      const profile = parsed.profiles?.find((p) => p.name === profileName);
      if (!profile) {
        ctx.ui.notify(`No profile named "${profileName}" in ${bundlesPath}. Known: ${(parsed.profiles ?? []).map((p) => p.name).join(", ") || "(none)"}`, "error");
        return;
      }
      if ((profile.rules ?? []).includes(rule)) {
        ctx.ui.notify(`That shadow is already bound to "${profileName}" — nothing to extract.`, "info");
        return;
      }
      const approved = await ctx.ui.confirm(
        `ARISE — extract into "${profileName}"?`,
        `Append this rule to ${profileName}.rules in ${bundlesPath}:\n\n"${rule}"`,
      );
      if (!approved) {
        ctx.ui.notify("Shadow released — no change written.", "info");
        return;
      }
      profile.rules = [...(profile.rules ?? []), rule];
      try {
        fs.writeFileSync(bundlesPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
      } catch (err) {
        ctx.ui.notify(`Failed to write ${bundlesPath}: ${(err as Error).message}`, "error");
        return;
      }
      ctx.ui.notify(`🗡 Shadow extracted — "${profileName}" now carries ${profile.rules.length} rules. It takes effect on the next gate of that class.`, "info");
    },
  });

  // ---- 🏆 /rank — Hunter Rank card (in-session, flavor; resets when the session restarts) ----
  pi.registerCommand("rank", {
    description: "Show your Hunter Rank card for this session (gates cleared per class, bosses fought)",
    handler: async (_args, ctx) => {
      const gates = [...gatesCleared.entries()].sort((a, b) => b[1] - a[1]);
      const total = gates.reduce((n, [, c]) => n + c, 0);
      const rankName = total >= 20 ? "S" : total >= 10 ? "A" : total >= 5 ? "B" : total >= 2 ? "C" : total >= 1 ? "D" : "E";
      const breakdown = gates.map(([name, c]) => `  ${name}: ${c}`).join("\n") || "  (no gates cleared yet)";
      ctx.ui.notify(
        `🏆 Hunter Rank ${rankName} — ${total} gate${total === 1 ? "" : "s"} cleared, ${bossesFought} boss${bossesFought === 1 ? "" : "es"} fought` +
          (poisonedProviders.size ? `, ☠ poisoned (${[...poisonedProviders].join(", ")})` : "") +
          `\n${breakdown}`,
        "info",
      );
    },
  });
}
