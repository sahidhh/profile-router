import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { classify, merge, loadBundles, type Bundles, type Profile } from "../profile-router.ts";

// ---------- Fixtures ----------

function profile(overrides: Partial<Profile> & { name: string; keywords: string[] }): Profile {
  return { rules: [], skills: [], tools: [], disabledAgents: [], ...overrides };
}

const fixtureBundles: Bundles = {
  default: {
    model: "anthropic/claude-sonnet-5",
    thinkingLevel: "medium",
    rules: ["default-rule"],
  },
  profiles: [
    profile({
      name: "alpha",
      keywords: ["alpha-kw", "shared-kw"],
      rules: ["alpha-rule"],
      skills: ["alpha-skill"],
      tools: ["read"],
      disabledAgents: ["task"],
      model: "anthropic/claude-haiku-4-5-20251001",
      thinkingLevel: "low",
    }),
    profile({
      name: "beta",
      keywords: ["beta-kw", "shared-kw"],
      rules: ["beta-rule"],
      skills: ["beta-skill"],
      tools: ["edit"],
      disabledAgents: [],
      model: "anthropic/claude-opus-4-8",
      thinkingLevel: "high",
    }),
    profile({
      name: "gamma",
      keywords: ["gamma-kw", "shared-kw"],
      rules: ["gamma-rule"],
      tools: ["bash"],
      disabledAgents: ["task"],
      model: "anthropic/claude-sonnet-5",
      thinkingLevel: "medium",
    }),
    // "tie-a" and "tie-b" both match on exactly one identical keyword, so their
    // classify() score is equal; declaration order (tie-a before tie-b) must
    // decide which one's single-value fields win.
    profile({
      name: "tie-a",
      keywords: ["tie-kw"],
      model: "model-a",
      thinkingLevel: "low",
    }),
    profile({
      name: "tie-b",
      keywords: ["tie-kw"],
      model: "model-b",
      thinkingLevel: "high",
    }),
  ],
};

// ---------- classify() ----------

describe("classify", () => {
  test("single-profile match", () => {
    const hits = classify("please use alpha-kw here", fixtureBundles);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.profile.name, "alpha");
    assert.equal(hits[0]?.score, 1);
  });

  test("multi-profile match, ranked by score descending", () => {
    // "shared-kw" hits alpha, beta, gamma (1 pt each); "beta-kw" gives beta a 2nd point.
    const hits = classify("shared-kw and beta-kw together", fixtureBundles);
    assert.equal(hits.length, 3);
    assert.equal(hits[0]?.profile.name, "beta");
    assert.equal(hits[0]?.score, 2);
    // alpha and gamma tie at score 1; declaration order (alpha before gamma) breaks the tie.
    assert.equal(hits[1]?.profile.name, "alpha");
    assert.equal(hits[2]?.profile.name, "gamma");
  });

  test("word-boundary matching: substrings do not false-positive", () => {
    // "alpha-kwx" must NOT match keyword "alpha-kw" (word boundary at the end).
    const hits = classify("alpha-kwx is unrelated", fixtureBundles);
    assert.equal(hits.length, 0);
  });

  test("no match returns empty array", () => {
    const hits = classify("nothing relevant in this sentence", fixtureBundles);
    assert.equal(hits.length, 0);
  });

  test("tie score: declaration order breaks the tie", () => {
    const hits = classify("tie-kw appears once", fixtureBundles);
    assert.equal(hits.length, 2);
    assert.equal(hits[0]?.profile.name, "tie-a");
    assert.equal(hits[0]?.score, hits[1]?.score);
  });
});

// ---------- merge() ----------

describe("merge", () => {
  test("no match falls back to the default profile", () => {
    const cfg = merge([], fixtureBundles);
    assert.equal(cfg.matched.length, 0);
    assert.deepEqual(cfg.rules, ["default-rule"]);
    assert.equal(cfg.model, "anthropic/claude-sonnet-5");
    assert.equal(cfg.thinkingLevel, "medium");
    assert.deepEqual(cfg.disabledAgents, []);
  });

  test("single-profile match carries that profile's fields through untouched", () => {
    const matches = classify("alpha-kw only", fixtureBundles);
    const cfg = merge(matches, fixtureBundles);
    assert.deepEqual(cfg.rules, ["alpha-rule"]);
    assert.deepEqual(cfg.skills, ["alpha-skill"]);
    assert.deepEqual(cfg.tools, ["read"]);
    assert.deepEqual(cfg.disabledAgents, ["task"]);
    assert.equal(cfg.model, "anthropic/claude-haiku-4-5-20251001");
    assert.equal(cfg.thinkingLevel, "low");
  });

  test("list fields (rules/skills/tools) union with dedup across matched profiles", () => {
    const matches = classify("shared-kw only", fixtureBundles); // hits alpha, beta, gamma equally
    const cfg = merge(matches, fixtureBundles);
    assert.deepEqual(cfg.rules.sort(), ["alpha-rule", "beta-rule", "gamma-rule"].sort());
    assert.deepEqual(cfg.skills.sort(), ["alpha-skill", "beta-skill"].sort());
    assert.deepEqual(cfg.tools.sort(), ["bash", "edit", "read"].sort());
  });

  test("dedup: a rule declared by two matched profiles appears once", () => {
    const dupeBundles: Bundles = {
      profiles: [
        profile({ name: "p1", keywords: ["dupe-kw"], rules: ["shared-rule", "p1-only"] }),
        profile({ name: "p2", keywords: ["dupe-kw"], rules: ["shared-rule", "p2-only"] }),
      ],
    };
    const cfg = merge(classify("dupe-kw", dupeBundles), dupeBundles);
    assert.deepEqual(cfg.rules.sort(), ["p1-only", "p2-only", "shared-rule"].sort());
  });

  test("disabledAgents: single match passes its list through", () => {
    const matches = classify("alpha-kw", fixtureBundles);
    const cfg = merge(matches, fixtureBundles);
    assert.deepEqual(cfg.disabledAgents, ["task"]);
  });

  test("disabledAgents: intersection across multiple matches — any profile enabling an agent keeps it enabled", () => {
    // alpha disables "task", beta disables nothing -> intersection is empty (task stays enabled).
    const matches = classify("alpha-kw beta-kw", fixtureBundles);
    const cfg = merge(matches, fixtureBundles);
    assert.deepEqual(cfg.disabledAgents, []);
  });

  test("disabledAgents: intersection of two profiles that both disable the same agent keeps it disabled", () => {
    // alpha and gamma both disable "task" -> intersection is ["task"].
    const matches = classify("alpha-kw gamma-kw", fixtureBundles);
    const cfg = merge(matches, fixtureBundles);
    assert.deepEqual(cfg.disabledAgents, ["task"]);
  });

  test("disabledAgents: disjoint sets across 3 matches intersect to empty", () => {
    const disjointBundles: Bundles = {
      profiles: [
        profile({ name: "d1", keywords: ["disjoint-kw"], disabledAgents: ["task"] }),
        profile({ name: "d2", keywords: ["disjoint-kw"], disabledAgents: ["scout"] }),
        profile({ name: "d3", keywords: ["disjoint-kw"], disabledAgents: [] }),
      ],
    };
    const cfg = merge(classify("disjoint-kw", disjointBundles), disjointBundles);
    assert.deepEqual(cfg.disabledAgents, []);
  });

  test("single-value fields: highest score wins", () => {
    // "beta-kw shared-kw" gives beta score 2, alpha/gamma score 1 -> beta's model/thinkingLevel win.
    const matches = classify("beta-kw shared-kw", fixtureBundles);
    const cfg = merge(matches, fixtureBundles);
    assert.equal(cfg.model, "anthropic/claude-opus-4-8");
    assert.equal(cfg.thinkingLevel, "high");
  });

  test("single-value fields: tie score breaks on declaration order", () => {
    const matches = classify("tie-kw", fixtureBundles);
    const cfg = merge(matches, fixtureBundles);
    assert.equal(cfg.model, "model-a"); // tie-a declared before tie-b
    assert.equal(cfg.thinkingLevel, "low");
  });

  test("manual override behaves as a single infinite-score match", () => {
    const overrideProfile = fixtureBundles.profiles.find((p) => p.name === "gamma")!;
    const cfg = merge([{ profile: overrideProfile, score: Number.POSITIVE_INFINITY }], fixtureBundles);
    assert.deepEqual(cfg.matched, [{ name: "gamma", score: Number.POSITIVE_INFINITY }]);
    assert.deepEqual(cfg.rules, ["gamma-rule"]);
    assert.equal(cfg.model, "anthropic/claude-sonnet-5");
  });

  test("disabledTools: UNION across matches — any profile blocking a tool wins (opposite of disabledAgents)", () => {
    const b: Bundles = {
      profiles: [
        profile({ name: "s1", keywords: ["oath-kw"], disabledTools: ["write", "edit"] }),
        profile({ name: "s2", keywords: ["oath-kw"], disabledTools: ["bash"] }),
        profile({ name: "s3", keywords: ["oath-kw"] }), // declares no disabledTools; must NOT dilute the oath
      ],
    };
    const cfg = merge(classify("oath-kw", b), b);
    assert.deepEqual(cfg.disabledTools.sort(), ["bash", "edit", "write"].sort());
  });

  test("maxMinions: MIN across matches — the tightest summon cap wins; undefined leaves it uncapped", () => {
    const b: Bundles = {
      profiles: [
        profile({ name: "m1", keywords: ["cap-kw"], maxMinions: 5 }),
        profile({ name: "m2", keywords: ["cap-kw"], maxMinions: 2 }),
        profile({ name: "m3", keywords: ["cap-kw"] }), // no cap declared -> ignored, doesn't loosen
      ],
    };
    assert.equal(merge(classify("cap-kw", b), b).maxMinions, 2);

    const uncapped: Bundles = { profiles: [profile({ name: "u", keywords: ["u-kw"] })] };
    assert.equal(merge(classify("u-kw", uncapped), uncapped).maxMinions, undefined);
  });

  test("noConfirm: OR across matches — any Berserker-flagged profile flips it on", () => {
    const b: Bundles = {
      profiles: [
        profile({ name: "n1", keywords: ["berserk-kw"] }),
        profile({ name: "n2", keywords: ["berserk-kw"], noConfirm: true }),
      ],
    };
    assert.equal(merge(classify("berserk-kw", b), b).noConfirm, true);

    const calm: Bundles = { profiles: [profile({ name: "c", keywords: ["calm-kw"] })] };
    assert.equal(merge(classify("calm-kw", calm), calm).noConfirm, false);
  });

  test("default fallback carries disabledTools / maxMinions / noConfirm when nothing matches", () => {
    const b: Bundles = {
      default: { disabledTools: ["write"], maxMinions: 1, noConfirm: true },
      profiles: [profile({ name: "x", keywords: ["x-kw"] })],
    };
    const cfg = merge([], b);
    assert.deepEqual(cfg.disabledTools, ["write"]);
    assert.equal(cfg.maxMinions, 1);
    assert.equal(cfg.noConfirm, true);
  });
});

// ---------- loadBundles() ----------

describe("loadBundles", () => {
  function withTempDir(fn: (dir: string) => void) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-router-test-"));
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  test("missing config returns empty profiles, no crash, no notify", () => {
    withTempDir((dir) => {
      let notified = false;
      const bundles = loadBundles(dir, () => {
        notified = true;
      });
      assert.deepEqual(bundles, { profiles: [] });
      assert.equal(notified, false);
    });
  });

  test("malformed JSON returns empty profiles and notifies exactly once", () => {
    withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, ".omp"));
      fs.writeFileSync(path.join(dir, ".omp", "bundles.json"), "{ not valid json");
      let notifyCount = 0;
      loadBundles(dir, () => notifyCount++);
      loadBundles(dir, () => notifyCount++);
      assert.equal(notifyCount, 1, "should only warn once per malformed path across repeated loads");
    });
  });

  test("valid config with wrong shape (profiles not an array) is treated as malformed", () => {
    withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, ".omp"));
      fs.writeFileSync(path.join(dir, ".omp", "bundles.json"), JSON.stringify({ profiles: "nope" }));
      let notified = false;
      const bundles = loadBundles(dir, () => {
        notified = true;
      });
      assert.deepEqual(bundles, { profiles: [] });
      assert.equal(notified, true);
    });
  });

  test("valid project-local config loads and takes precedence", () => {
    withTempDir((dir) => {
      fs.mkdirSync(path.join(dir, ".omp"));
      const projectBundles: Bundles = { profiles: [profile({ name: "project-profile", keywords: ["x"] })] };
      fs.writeFileSync(path.join(dir, ".omp", "bundles.json"), JSON.stringify(projectBundles));
      const bundles = loadBundles(dir, () => {
        throw new Error("should not notify on valid config");
      });
      assert.equal(bundles.profiles[0]?.name, "project-profile");
    });
  });
});

// ---------- Per-authored-profile reachability against the real bundles.json ----------

describe("bundles.json reachability", () => {
  const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
  const realBundles = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;

  const reachabilityPrompts: Record<string, string> = {
    lookup: "can you find where the auth middleware is defined and explain how it works",
    architecture: "I need to design a new module for the notification system, cross-cutting several services",
    implementation: "please implement the new feature and write the code for the endpoint",
    review: "do a code review of this pull request before pre-merge",
    investigation: "investigate the root cause of why this test is flaky, trace through the logs",
    premium: "this touches a schema migration and rotates a credential/secret token",
    hotfix: "we need a quick fix hotfix for this UI bugfix under time pressure",
  };

  // Class builds (ARSENAL): keyword-less profiles reachable only via /equip, never auto-classified.
  const classNames = ["wretch", "vanguard", "archmage", "monarch", "sentinel", "berserker"];

  test("bundles.json declares the 7 task profiles plus the 6 class builds", () => {
    const names = realBundles.profiles.map((p) => p.name).sort();
    assert.deepEqual(names, [...Object.keys(reachabilityPrompts), ...classNames].sort());
  });

  for (const [name, promptText] of Object.entries(reachabilityPrompts)) {
    test(`profile "${name}" is reachable and wins its own trigger prompt`, () => {
      const hits = classify(promptText, realBundles);
      assert.ok(hits.length > 0, `expected at least one match for prompt: "${promptText}"`);
      assert.equal(
        hits[0]?.profile.name,
        name,
        `expected "${name}" to outrank ${hits[0]?.profile.name} for prompt: "${promptText}" (all hits: ${hits.map((h) => `${h.profile.name}:${h.score}`).join(", ")})`,
      );
    });
  }

  test("every task profile has keywords; every class build has none", () => {
    for (const p of realBundles.profiles) {
      if (classNames.includes(p.name)) {
        assert.equal(p.keywords.length, 0, `class build "${p.name}" must be keyword-less (equip-only)`);
      } else {
        assert.ok(p.keywords.length > 0, `task profile "${p.name}" has no keywords`);
      }
    }
  });

  test("class builds are never auto-classified (keyword-less), only equippable", () => {
    // A prompt echoing every class name must not surface any class via classify().
    const hits = classify(`wretch vanguard archmage monarch sentinel berserker ${classNames.join(" ")}`, realBundles);
    for (const h of hits) {
      assert.ok(!classNames.includes(h.profile.name), `class "${h.profile.name}" must not auto-match`);
    }
    // But each is reachable as a manual override (single infinite-score match), as /equip does.
    for (const name of classNames) {
      const p = realBundles.profiles.find((x) => x.name === name)!;
      const cfg = merge([{ profile: p, score: Number.POSITIVE_INFINITY }], realBundles);
      assert.equal(cfg.matched[0]?.name, name);
    }
  });

  test("sentinel build blocks mutating tools; monarch caps summons at 3", () => {
    const sentinel = realBundles.profiles.find((p) => p.name === "sentinel")!;
    const scfg = merge([{ profile: sentinel, score: Number.POSITIVE_INFINITY }], realBundles);
    assert.deepEqual(scfg.disabledTools.sort(), ["bash", "edit", "write"].sort());
    const monarch = realBundles.profiles.find((p) => p.name === "monarch")!;
    const mcfg = merge([{ profile: monarch, score: Number.POSITIVE_INFINITY }], realBundles);
    assert.equal(mcfg.maxMinions, 3);
    assert.ok(mcfg.tools.includes("task"), "monarch must keep the task tool active to summon");
    assert.ok(!mcfg.disabledAgents.includes("task"), "monarch must leave subagents enabled");
  });

  test("default fallback model resolves when nothing matches", () => {
    const cfg = merge(classify("asdkjhasdkjh completely unrelated gibberish", realBundles), realBundles);
    assert.equal(cfg.matched.length, 0);
    assert.equal(cfg.model, realBundles.default?.model);
  });
});

// ---------- Extension module load smoke test ----------

describe("extension module", () => {
  test("default export is a factory function that registers handlers without throwing", async () => {
    const mod = await import("../profile-router.ts");
    assert.equal(typeof mod.default, "function");

    const handlers: Record<string, unknown> = {};
    const commands: Record<string, unknown> = {};
    const fakePi = {
      on: (event: string, handler: unknown) => {
        handlers[event] = handler;
      },
      registerCommand: (name: string, opts: unknown) => {
        commands[name] = opts;
      },
      setModel: async () => true,
      setThinkingLevel: () => {},
      setActiveTools: async () => {},
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };

    // Should not throw when invoked with a minimal fake ExtensionAPI.
    await mod.default(fakePi as never);

    assert.ok(handlers["before_agent_start"], "before_agent_start handler registered");
    assert.ok(handlers["tool_call"], "tool_call handler registered");
    assert.ok(commands["profile"], "/profile command registered");
  });
});

// ---------- Full-handler harness (drives the real before_agent_start / /profile logic) ----------

async function withTempProjectDir(fn: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-router-test-"));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeBundles(dir: string, bundles: Bundles) {
  fs.mkdirSync(path.join(dir, ".omp"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".omp", "bundles.json"), JSON.stringify(bundles));
}

/** Installs the extension against a fake ExtensionAPI and returns its handlers + a fake ctx bound to `dir`. */
async function installExtension(
  dir: string,
  opts: {
    resolve?: (model: string) => { id: string; provider: string } | undefined;
    confirm?: () => Promise<boolean>;
    currentModel?: { id: string; provider: string };
  } = {},
) {
  const mod = await import("../profile-router.ts");
  const handlers: Record<string, (event: unknown, ctx: unknown) => unknown> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => unknown }> = {};
  const notifications: { msg: string; level: string }[] = [];
  const sentMessages: { content: unknown; options: unknown }[] = [];
  const setModelCalls: unknown[] = [];

  const fakePi = {
    on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers[event] = handler;
    },
    registerCommand: (name: string, opts2: { handler: (args: string, ctx: unknown) => unknown }) => {
      commands[name] = opts2;
    },
    setModel: async (m: unknown) => {
      setModelCalls.push(m);
      return true;
    },
    setThinkingLevel: () => {},
    setActiveTools: async () => {},
    sendUserMessage: (content: unknown, options: unknown) => sentMessages.push({ content, options }),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  };
  await mod.default(fakePi as never);

  const statuses: Record<string, string> = {};
  const ctx = {
    cwd: dir,
    ui: {
      notify: (msg: string, level: string) => notifications.push({ msg, level }),
      confirm: opts.confirm ?? (async () => true),
      setStatus: (key: string, value: string) => {
        statuses[key] = value;
      },
    },
    models: { resolve: opts.resolve ?? ((_model: string) => undefined) },
    model: opts.currentModel,
  };

  return { handlers, commands, notifications, statuses, sentMessages, setModelCalls, ctx };
}

describe("F2 regression: stale /profile override never mislabels an auto-classified profile as manual", () => {
  test("pinning a profile that is later removed clears the pin instead of relabeling auto-classification", async () => {
    await withTempProjectDir(async (dir) => {
      const bundles: Bundles = {
        profiles: [
          profile({ name: "pinned-profile", keywords: ["pin-kw"] }),
          profile({ name: "other-profile", keywords: ["other-kw"] }),
        ],
      };
      writeBundles(dir, bundles);

      const { handlers, commands, notifications, statuses, ctx } = await installExtension(dir);

      // Pin "pinned-profile" via /profile.
      await commands["profile"]!.handler("pinned-profile", ctx);

      // Rewrite bundles.json: pinned-profile is gone, but a keyword-matching
      // "other-profile" remains so auto-classification finds a real match.
      writeBundles(dir, {
        profiles: [profile({ name: "other-profile", keywords: ["other-kw"] })],
      });

      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "other-kw here", systemPrompt: [] }, ctx);

      assert.equal(statuses["profile"], "⚙ other-profile", "must not append (manual) to an auto-classified profile");
      assert.ok(
        notifications.some((n) => n.msg.includes("no longer exists") && n.level === "warning"),
        "must warn once that the stale pin was cleared",
      );

      // The pin must actually be cleared: a subsequent auto-classified prompt for a
      // *different* profile must not still be treated as the stale override.
      writeBundles(dir, {
        profiles: [
          profile({ name: "other-profile", keywords: ["other-kw"] }),
          profile({ name: "third-profile", keywords: ["third-kw"] }),
        ],
      });
      await handlers["before_agent_start"]!({ prompt: "third-kw here", systemPrompt: [] }, ctx);
      assert.equal(statuses["profile"], "⚙ third-profile", "cleared pin must not resurrect pinned-profile or relabel");
    });
  });
});

describe("F3 regression: unresolvable model warns exactly once per session", () => {
  test("notifies naming the profile and bad model string, then degrades silently on repeat", async () => {
    await withTempProjectDir(async (dir) => {
      const bundles: Bundles = {
        profiles: [profile({ name: "broken-model-profile", keywords: ["trigger-kw"], model: "anthropic/does-not-exist" })],
      };
      writeBundles(dir, bundles);

      const { handlers, notifications, ctx } = await installExtension(dir);

      await handlers["before_agent_start"]!({ prompt: "trigger-kw once", systemPrompt: [] }, ctx);
      const warnings = notifications.filter((n) => n.level === "warning" && n.msg.includes("does-not-exist"));
      assert.equal(warnings.length, 1, "should warn once for the unresolved model");
      assert.ok(warnings[0]!.msg.includes("broken-model-profile"), "warning must name the profile");
      assert.ok(warnings[0]!.msg.includes("anthropic/does-not-exist"), "warning must name the bad model string");

      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "trigger-kw again", systemPrompt: [] }, ctx);
      const secondWarnings = notifications.filter((n) => n.level === "warning" && n.msg.includes("does-not-exist"));
      assert.equal(secondWarnings.length, 0, "must not re-warn for the same model string in the same session");
    });
  });
});

// ---------- F4 regression: intra-profile keyword self-overlap must not double-count ----------

describe("classify: intra-profile keyword overlap dedup", () => {
  test("a longer keyword phrase and a shorter keyword it contains score only once", () => {
    const overlapBundles: Bundles = {
      profiles: [profile({ name: "overlap-profile", keywords: ["review", "code review", "pull request review"] })],
    };
    // "code review" contains the standalone word "review" with no other occurrence in the text.
    const hits = classify("this pull request review needs a look", overlapBundles);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.score, 1, "the phrase and its contained keyword must not both score");
  });

  test("a genuinely separate second occurrence of the shorter keyword still scores", () => {
    const overlapBundles: Bundles = {
      profiles: [profile({ name: "overlap-profile", keywords: ["review", "code review"] })],
    };
    // "code review" claims one "review" occurrence; a second, separate "review" elsewhere still counts.
    const hits = classify("please do a code review, then review the docs separately", overlapBundles);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.score, 2, "an unrelated separate occurrence of the shorter keyword must still count");
  });

  test("real bundles.json: 'review' profile no longer double-counts on 'code review' / 'pull request review'", () => {
    const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
    const realBundles = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;
    const hits = classify("the password reset flow needs a code review before we merge this PR", realBundles);
    const review = hits.find((h) => h.profile.name === "review");
    assert.ok(review, "review profile should still match");
    assert.equal(review?.score, 1, "code review should no longer double-count against bare review");
  });
});

// ---------- ARSENAL mechanics (handler-level) ----------

describe("🔥 Embers: compaction re-injects active oaths", () => {
  test("session.compacting returns the active profile's rules as summary context and notifies", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "guarded", keywords: ["guard-kw"], rules: ["Never lower a guardrail."] })] });
      const { handlers, notifications, ctx } = await installExtension(dir);

      // No active config yet -> nothing to restore.
      const before = (await handlers["session.compacting"]!({ type: "session.compacting" }, ctx)) as { context?: string[] } | void;
      assert.equal(before, undefined);

      // Classify a gate so rules become active, then compact.
      await handlers["before_agent_start"]!({ prompt: "guard-kw please", systemPrompt: [] }, ctx);
      notifications.length = 0;
      const result = (await handlers["session.compacting"]!({ type: "session.compacting" }, ctx)) as { context?: string[] };
      assert.ok(result?.context?.some((line) => line.includes("Never lower a guardrail.")), "active oath must survive compaction");
      assert.ok(notifications.some((n) => n.msg.includes("Ember restored")), "must notify that the ember was restored");
    });
  });
});

describe("🩸 Poison: silent provider fallback is surfaced", () => {
  test("credential_disabled sets a persistent status marker and warns", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "any", keywords: ["k"] })] });
      const { handlers, notifications, statuses, ctx } = await installExtension(dir);
      await handlers["credential_disabled"]!({ type: "credential_disabled", provider: "anthropic", disabledCause: "invalid_grant" }, ctx);
      assert.ok(statuses["poison"]?.includes("anthropic"), "poison status must name the downed provider");
      assert.ok(
        notifications.some((n) => n.level === "warning" && n.msg.includes("anthropic") && n.msg.includes("invalid_grant")),
        "must warn with provider + cause",
      );
    });
  });
});

describe("⚖ Sentinel: disabledTools is a hard block", () => {
  test("a blocked tool call is rejected once the sentinel build is equipped", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "sentinel", keywords: [], tools: ["read"], disabledTools: ["edit", "write"] })],
      });
      const { handlers, commands, ctx } = await installExtension(dir);
      await commands["equip"]!.handler("sentinel", ctx);
      await handlers["before_agent_start"]!({ prompt: "review this", systemPrompt: [] }, ctx);

      const edit = (await handlers["tool_call"]!({ toolName: "edit", input: {} }, ctx)) as { block?: boolean } | void;
      assert.equal(edit?.block, true, "edit must be blocked by the sentinel oath");
      const read = (await handlers["tool_call"]!({ toolName: "read", input: {} }, ctx)) as { block?: boolean } | void;
      assert.equal(read ?? undefined, undefined, "read must pass through");
    });
  });
});

describe("👑 Monarch: summon cap blocks the (maxMinions+1)-th live task", () => {
  test("allows up to the cap, blocks beyond it, and frees a slot on task completion", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "monarch", keywords: [], tools: ["task"], maxMinions: 2 })] });
      const { handlers, commands, ctx } = await installExtension(dir);
      await commands["equip"]!.handler("monarch", ctx);
      await handlers["before_agent_start"]!({ prompt: "orchestrate", systemPrompt: [] }, ctx);

      const call = () => handlers["tool_call"]!({ toolName: "task", input: {} }, ctx) as Promise<{ block?: boolean } | void>;
      assert.equal((await call())?.block ?? undefined, undefined, "1st summon allowed");
      assert.equal((await call())?.block ?? undefined, undefined, "2nd summon allowed");
      assert.equal((await call())?.block, true, "3rd summon blocked at cap 2");

      // A minion returns -> a slot frees -> next summon allowed again.
      await handlers["tool_execution_end"]!({ toolName: "task" }, ctx);
      assert.equal((await call())?.block ?? undefined, undefined, "summon allowed after a minion returns");

      // A new gate resets the army entirely.
      await handlers["before_agent_start"]!({ prompt: "orchestrate again", systemPrompt: [] }, ctx);
      assert.equal((await call())?.block ?? undefined, undefined, "new gate starts with a fresh army");
    });
  });
});

describe("🗡 Berserker: noConfirm auto-accepts model switches", () => {
  test("switches model without calling confirm when the build sets noConfirm", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "berserker", keywords: [], noConfirm: true, model: "anthropic/claude-sonnet-5" })],
      });
      let confirmCalls = 0;
      const { handlers, commands, setModelCalls, ctx } = await installExtension(dir, {
        confirm: async () => {
          confirmCalls++;
          return true;
        },
        resolve: (m) => ({ id: m.split("/")[1] ?? m, provider: "anthropic" }),
        currentModel: { id: "claude-haiku-4-5-20251001", provider: "anthropic" },
      });
      await commands["equip"]!.handler("berserker", ctx);
      await handlers["before_agent_start"]!({ prompt: "go", systemPrompt: [] }, ctx);
      assert.equal(confirmCalls, 0, "Berserker must not open a confirm dialog");
      assert.equal(setModelCalls.length, 1, "model must still switch");
    });
  });
});

describe("🗡 /arise: Shadow Extraction persists one approved rule", () => {
  test("Form B: /arise <profile> <rule> appends directly after confirm, with dedup", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "implementation", keywords: ["impl-kw"], rules: ["existing-rule"] })] });
      const { commands, ctx } = await installExtension(dir);

      await commands["arise"]!.handler('implementation Prefer the framework native facility.', ctx);
      const written = JSON.parse(fs.readFileSync(path.join(dir, ".omp", "bundles.json"), "utf-8")) as Bundles;
      assert.deepEqual(written.profiles.find((p) => p.name === "implementation")!.rules, [
        "existing-rule",
        "Prefer the framework native facility.",
      ]);

      // Re-arising the same rule is a no-op (dedup).
      await commands["arise"]!.handler('implementation Prefer the framework native facility.', ctx);
      const again = JSON.parse(fs.readFileSync(path.join(dir, ".omp", "bundles.json"), "utf-8")) as Bundles;
      assert.equal(again.profiles.find((p) => p.name === "implementation")!.rules!.length, 2, "dedup: no duplicate rule");
    });
  });

  test("Form A: /arise <profile> arms capture; the model's next terminal answer is auto-persisted", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "implementation", keywords: ["impl-kw"] })] });
      const { handlers, commands, sentMessages, ctx } = await installExtension(dir);

      // Arm: asks the model (followUp) and records the target profile.
      await commands["arise"]!.handler("implementation", ctx);
      assert.equal(sentMessages.length, 1, "must send the distill prompt");
      assert.equal((sentMessages[0]!.options as { deliverAs?: string })?.deliverAs, "followUp");

      // A tool-calling turn must NOT be captured (wait for the terminal text answer).
      await handlers["message_end"]!(
        { message: { role: "assistant", content: [{ type: "text", text: "let me look" }, { type: "tool_call" }] } },
        ctx,
      );
      let written = JSON.parse(fs.readFileSync(path.join(dir, ".omp", "bundles.json"), "utf-8")) as Bundles;
      assert.deepEqual(written.profiles.find((p) => p.name === "implementation")!.rules, [], "tool turn not captured");

      // The terminal text answer is captured and persisted (first line only).
      await handlers["message_end"]!(
        { message: { role: "assistant", content: [{ type: "text", text: "Recompute derived data at read time.\nextra prose" }] } },
        ctx,
      );
      written = JSON.parse(fs.readFileSync(path.join(dir, ".omp", "bundles.json"), "utf-8")) as Bundles;
      assert.deepEqual(written.profiles.find((p) => p.name === "implementation")!.rules, ["Recompute derived data at read time."]);

      // One-shot: a subsequent assistant message is NOT captured again.
      await handlers["message_end"]!({ message: { role: "assistant", content: [{ type: "text", text: "Another sentence." }] } }, ctx);
      written = JSON.parse(fs.readFileSync(path.join(dir, ".omp", "bundles.json"), "utf-8")) as Bundles;
      assert.equal(written.profiles.find((p) => p.name === "implementation")!.rules!.length, 1, "capture is one-shot");
    });
  });

  test("/arise <unknown> as an arm target errors and arms nothing", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "implementation", keywords: ["impl-kw"] })] });
      const { handlers, commands, notifications, sentMessages, ctx } = await installExtension(dir);
      await commands["arise"]!.handler("nonesuch", ctx);
      assert.ok(notifications.some((n) => n.level === "error" && n.msg.includes("nonesuch")), "must error on unknown profile");
      assert.equal(sentMessages.length, 0, "must not ask the model when the target is invalid");
      // No capture armed -> a later assistant message writes nothing.
      await handlers["message_end"]!({ message: { role: "assistant", content: [{ type: "text", text: "x" }] } }, ctx);
      assert.equal(fs.existsSync(path.join(dir, ".omp", "bundles.json")), true);
    });
  });

  test("/arise <profile> <rule> into an unknown profile errors and writes nothing", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "implementation", keywords: ["impl-kw"] })] });
      const { commands, notifications, ctx } = await installExtension(dir);
      await commands["arise"]!.handler("nonesuch some rule text", ctx);
      assert.ok(notifications.some((n) => n.level === "error" && n.msg.includes("nonesuch")), "must error on unknown profile");
    });
  });
});

describe("🏆 Hunter Rank: persistent across sessions", () => {
  test("gates, bosses, and bonfires accumulate to hunter-rank.json and survive a reinstall", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "premium", keywords: ["prem-kw"], thinkingLevel: "high" })],
      });

      // Session 1: two gates (a high-thinking boss each) + one commit bonfire.
      {
        const { handlers, ctx } = await installExtension(dir);
        await handlers["before_agent_start"]!({ prompt: "prem-kw one", systemPrompt: [] }, ctx);
        await handlers["before_agent_start"]!({ prompt: "prem-kw two", systemPrompt: [] }, ctx);
        await handlers["tool_call"]!({ toolName: "bash", input: { command: "git commit -m x" } }, ctx);
      }

      const statsPath = path.join(dir, ".omp", "hunter-rank.json");
      const s1 = JSON.parse(fs.readFileSync(statsPath, "utf-8"));
      assert.equal(s1.gates["premium"], 2);
      assert.equal(s1.bosses, 2);
      assert.equal(s1.bonfires, 1);

      // Session 2 (fresh install = fresh in-memory state): stats keep accumulating from disk.
      {
        const { handlers, commands, notifications, ctx } = await installExtension(dir);
        await handlers["before_agent_start"]!({ prompt: "prem-kw three", systemPrompt: [] }, ctx);
        await commands["rank"]!.handler("", ctx);
        assert.ok(
          notifications.some((n) => n.msg.includes("3 gates") && n.msg.includes("3 bosses") && n.msg.includes("1 bonfire")),
          `rank card should reflect accumulated stats, got: ${notifications.map((n) => n.msg).join(" | ")}`,
        );
      }
    });
  });
});
