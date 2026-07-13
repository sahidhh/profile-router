import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { classify, merge, loadBundles, explain, validateBundles, type Bundles, type Profile } from "../profile-router.ts";

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
});

// ---------- explain() ----------

describe("explain", () => {
  test("returns a row for EVERY profile, including score-0 ones", () => {
    const rows = explain("alpha-kw only", fixtureBundles);
    assert.equal(rows.length, fixtureBundles.profiles.length);
    const alpha = rows.find((r) => r.name === "alpha");
    assert.equal(alpha?.score, 1);
    assert.deepEqual(alpha?.matched, ["alpha-kw"]);
    // beta/gamma/tie-* scored 0 but are still present.
    assert.ok(rows.some((r) => r.name === "beta" && r.score === 0 && r.matched.length === 0));
  });

  test("sorted score-desc then declaration order; winner first", () => {
    const rows = explain("shared-kw and beta-kw together", fixtureBundles);
    assert.equal(rows[0]?.name, "beta");
    assert.equal(rows[0]?.score, 2);
    // alpha before gamma on the tie at score 1.
    const alphaIdx = rows.findIndex((r) => r.name === "alpha");
    const gammaIdx = rows.findIndex((r) => r.name === "gamma");
    assert.ok(alphaIdx < gammaIdx);
  });

  test("intra-profile overlap dedup: phrase and contained keyword report once", () => {
    const overlapBundles: Bundles = {
      profiles: [profile({ name: "overlap-profile", keywords: ["review", "code review", "pull request review"] })],
    };
    const rows = explain("this pull request review needs a look", overlapBundles);
    assert.equal(rows[0]?.score, 1);
    assert.equal(rows[0]?.matched.length, 1);
  });
});

// ---------- validateBundles() ----------

describe("validateBundles", () => {
  test("real bundles.json passes with no problems", () => {
    const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
    const realBundles = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;
    assert.deepEqual(validateBundles(realBundles), []);
  });

  test("flags an empty keyword list", () => {
    const bundles: Bundles = { profiles: [{ name: "x", keywords: [] }] };
    const problems = validateBundles(bundles);
    assert.ok(problems.some((p) => p.includes("keywords")));
  });

  test("flags duplicate profile names", () => {
    const bundles: Bundles = {
      profiles: [profile({ name: "dup", keywords: ["a"] }), profile({ name: "dup", keywords: ["b"] })],
    };
    assert.ok(validateBundles(bundles).some((p) => p.includes("duplicate")));
  });

  test("flags an unknown thinkingLevel and a malformed model", () => {
    const bundles: Bundles = {
      profiles: [
        profile({ name: "bad", keywords: ["a"], thinkingLevel: "ultra" }),
        profile({ name: "badmodel", keywords: ["b"], model: 42 as never }),
      ],
    };
    const problems = validateBundles(bundles);
    assert.ok(problems.some((p) => p.includes("thinkingLevel")));
    assert.ok(problems.some((p) => p.includes("model")));
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
      // Create an empty bundles.json in project .omp to shadow any global ~/.omp/bundles.json
      fs.mkdirSync(path.join(dir, ".omp"));
      fs.writeFileSync(path.join(dir, ".omp", "bundles.json"), JSON.stringify({ profiles: [] }));
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

  test("bundles.json declares exactly the 7 expected profiles", () => {
    const names = realBundles.profiles.map((p) => p.name).sort();
    assert.deepEqual(names, Object.keys(reachabilityPrompts).sort());
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

  test("summarisation vocabulary routes to lookup (cheap model), not a judgment profile", () => {
    for (const promptText of [
      "summarize what this repo does",
      "give me an overview of the payment flow",
      "summarise the config loading logic",
    ]) {
      const hits = classify(promptText, realBundles);
      assert.ok(hits.length > 0, `expected a match for: "${promptText}"`);
      assert.equal(hits[0]?.profile.name, "lookup", `expected lookup to win "${promptText}"`);
    }
  });

  test("every code-exploring profile carries the lsp and ast_grep tools", () => {
    for (const p of realBundles.profiles) {
      if (p.name === "hotfix") continue; // deliberate minimal toolset — ceremony floor
      assert.ok(p.tools?.includes("lsp"), `profile "${p.name}" missing lsp`);
      assert.ok(p.tools?.includes("ast_grep"), `profile "${p.name}" missing ast_grep`);
    }
  });

  test("no profile has an empty keyword list", () => {
    for (const p of realBundles.profiles) {
      assert.ok(p.keywords.length > 0, `profile "${p.name}" has no keywords`);
    }
  });

  test("default fallback model resolves when nothing matches", () => {
    const cfg = merge(classify("asdkjhasdkjh completely unrelated gibberish", realBundles), realBundles);
    assert.equal(cfg.matched.length, 0);
    assert.equal(cfg.model, realBundles.default?.model);
  });

  test("T2: co-matching implementation and lookup produces no edit-prohibition text in merged rules", () => {
    // Prompt must match both implementation (write/build keywords) and lookup (find/explain keywords).
    const prompt = "implement the new feature and write code for it; can you also find where the auth middleware is defined and explain how it works";
    const classified = classify(prompt, realBundles);

    // Verify co-match actually happened.
    assert.ok(classified.length >= 2, `expected at least 2 profile matches, got ${classified.length}: ${classified.map((c) => c.profile.name).join(", ")}`);
    const matched = classified.map((c) => c.profile.name).sort();
    assert.ok(matched.includes("implementation"), `expected implementation in matches: ${matched.join(", ")}`);
    assert.ok(matched.includes("lookup"), `expected lookup in matches: ${matched.join(", ")}`);

    // Merge and check that rules union contains no edit-prohibition text.
    const cfg = merge(classified, realBundles);
    const rulesJoined = cfg.rules.join("\n");

    // Assert no prohibition language exists in merged rules.
    assert.ok(!/read-only/i.test(rulesJoined), `merged rules must not contain "read-only": ${rulesJoined}`);
    assert.ok(!/do not (edit|write)/i.test(rulesJoined), `merged rules must not contain "do not edit/write": ${rulesJoined}`);
    assert.ok(!/no (code )?edits?/i.test(rulesJoined), `merged rules must not contain "no edits": ${rulesJoined}`);
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
async function installExtension(dir: string) {
  const mod = await import("../profile-router.ts");
  const handlers: Record<string, (event: unknown, ctx: unknown) => unknown> = {};
  const commands: Record<string, { handler: (args: string, ctx: unknown) => unknown }> = {};
  const notifications: { msg: string; level: string }[] = [];
  const setModelCalls: unknown[] = [];

  const fakePi = {
    on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => {
      handlers[event] = handler;
    },
    registerCommand: (name: string, opts: { handler: (args: string, ctx: unknown) => unknown }) => {
      commands[name] = opts;
    },
    setModel: async (model: unknown) => {
      setModelCalls.push(model);
      return true;
    },
    setThinkingLevel: () => {},
    setActiveTools: async () => {},
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  };
  await mod.default(fakePi as never);

  const statuses: Record<string, string> = {};
  const ctx = {
    cwd: dir,
    ui: {
      notify: (msg: string, level: string) => notifications.push({ msg, level }),
      confirm: async () => true,
      setStatus: (key: string, value: string) => {
        statuses[key] = value;
      },
    },
    models: { resolve: (_model: string) => undefined },
    model: undefined,
  };

  return { handlers, commands, notifications, statuses, setModelCalls, ctx };
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

describe("model fallback chain: array model resolves in order", () => {
  test("first unresolvable candidate falls through to the second; no warning fires", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({
            name: "chain-profile",
            keywords: ["chain-kw"],
            model: ["openrouter/not-credentialed", "anthropic/claude-sonnet-5"],
          }),
        ],
      });

      const { handlers, notifications, setModelCalls, ctx } = await installExtension(dir);
      const sonnet = { id: "claude-sonnet-5", provider: "anthropic", name: "Sonnet" };
      ctx.models.resolve = ((spec: string) =>
        spec === "anthropic/claude-sonnet-5" ? sonnet : undefined) as never;

      await handlers["before_agent_start"]!({ prompt: "chain-kw here", systemPrompt: [] }, ctx);

      assert.deepEqual(setModelCalls, [sonnet], "must switch to the first resolvable candidate");
      assert.equal(
        notifications.filter((n) => n.level === "warning").length,
        0,
        "a chain with a resolvable fallback must not warn",
      );
    });
  });

  test("all candidates unresolvable warns exactly once, listing every candidate", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({
            name: "dead-chain-profile",
            keywords: ["dead-kw"],
            model: ["openrouter/nope-a", "provider/nope-b"],
          }),
        ],
      });

      const { handlers, notifications, setModelCalls, ctx } = await installExtension(dir);

      await handlers["before_agent_start"]!({ prompt: "dead-kw once", systemPrompt: [] }, ctx);
      await handlers["before_agent_start"]!({ prompt: "dead-kw again", systemPrompt: [] }, ctx);

      assert.equal(setModelCalls.length, 0);
      const warnings = notifications.filter((n) => n.level === "warning");
      assert.equal(warnings.length, 1, "must warn once per session for a dead chain");
      assert.ok(warnings[0]!.msg.includes("dead-chain-profile"), "warning must name the profile");
      assert.ok(warnings[0]!.msg.includes("openrouter/nope-a"), "warning must list the first candidate");
      assert.ok(warnings[0]!.msg.includes("provider/nope-b"), "warning must list the second candidate");
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

// ---------- /profile subcommands (list / debug / validate) via the full handler ----------

describe("/profile list", () => {
  test("emits one notification listing every profile name", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({ name: "alpha", keywords: ["a-kw"], description: "the alpha profile" }),
          profile({ name: "beta", keywords: ["b-kw"] }),
        ],
      });
      const { commands, notifications, ctx } = await installExtension(dir);
      await commands["profile"]!.handler("list", ctx);
      assert.equal(notifications.length, 1);
      const msg = notifications[0]!.msg;
      assert.ok(msg.includes("alpha") && msg.includes("beta"), "lists both profiles");
      assert.ok(msg.includes("the alpha profile"), "shows the description when present");
      assert.ok(msg.includes("keywords: b-kw"), "falls back to keywords when no description");
    });
  });
});

describe("/profile debug toggle", () => {
  test("on -> a prompt emits a routing trace naming the winner; off -> no trace", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({ name: "winner", keywords: ["win-kw"] }),
          profile({ name: "other", keywords: ["other-kw"] }),
        ],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);

      await commands["profile"]!.handler("debug on", ctx);
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "win-kw please", systemPrompt: [] }, ctx);
      const trace = notifications.find((n) => n.level === "info" && n.msg.includes("Profile routing"));
      assert.ok(trace, "a routing trace should fire while debug is on");
      assert.ok(trace!.msg.includes("winner"), "trace names the chosen profile");
      assert.ok(trace!.msg.includes("win-kw"), "trace shows the matched keyword");

      await commands["profile"]!.handler("debug off", ctx);
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "win-kw again", systemPrompt: [] }, ctx);
      assert.equal(
        notifications.filter((n) => n.msg.includes("Profile routing")).length,
        0,
        "no trace once debug is off",
      );
    });
  });
});

describe("session.compacting: mid-run rule re-injection", () => {
  test("compact with active rules -> rules present in handler result", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "alpha", keywords: ["alpha-kw"], rules: ["alpha-rule-one", "alpha-rule-two"] })],
      });
      const { handlers, ctx } = await installExtension(dir);

      await handlers["before_agent_start"]!({ prompt: "alpha-kw please", systemPrompt: [] }, ctx);

      const result = (await handlers["session.compacting"]!(
        { type: "session.compacting", sessionId: "x", messages: [] },
        ctx,
      )) as { context?: string[] } | undefined;

      assert.ok(result?.context, "expected a context array in the result");
      const joined = result!.context!.join("\n");
      assert.ok(joined.includes("alpha-rule-one"), "must include first rule");
      assert.ok(joined.includes("alpha-rule-two"), "must include second rule");
      assert.ok(joined.includes("alpha"), "must include the matched profile name");
    });
  });

  test("compact with active=null -> no-op", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "alpha", keywords: ["alpha-kw"], rules: ["alpha-rule"] })] });
      const { handlers, ctx } = await installExtension(dir);

      // No before_agent_start call yet, so `active` is still null.
      const result = await handlers["session.compacting"]!(
        { type: "session.compacting", sessionId: "x", messages: [] },
        ctx,
      );

      assert.equal(result, undefined);
    });
  });

  test("compact with matched profile but zero rules -> no-op", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "norules", keywords: ["norules-kw"], rules: [] })],
      });
      const { handlers, ctx } = await installExtension(dir);

      await handlers["before_agent_start"]!({ prompt: "norules-kw please", systemPrompt: [] }, ctx);

      const result = await handlers["session.compacting"]!(
        { type: "session.compacting", sessionId: "x", messages: [] },
        ctx,
      );

      assert.equal(result, undefined);
    });
  });
});

describe("/profile validate", () => {
  test("reports valid for a well-formed bundles.json", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "ok", keywords: ["k"] })] });
      const { commands, notifications, ctx } = await installExtension(dir);
      await commands["profile"]!.handler("validate", ctx);
      assert.ok(notifications.some((n) => n.level === "info" && n.msg.includes("valid")));
    });
  });

  test("reports problems for a malformed profile", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "bad", keywords: [] })] });
      const { commands, notifications, ctx } = await installExtension(dir);
      await commands["profile"]!.handler("validate", ctx);
      assert.ok(notifications.some((n) => n.level === "warning" && n.msg.includes("keywords")));
    });
  });
});
