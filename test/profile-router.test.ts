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

  // ---- Branch A rule suppression: union(rules) MINUS union(suppresses-by-tag) ----

  test("tagged rule suppression: a co-matched profile's suppresses removes another profile's tagged rule", () => {
    const bundles: Bundles = {
      profiles: [
        profile({
          name: "writer",
          keywords: ["writer-kw"],
          rules: ["untagged-shared", { tag: "verify", text: "must-run-tests" }, { tag: "implement", text: "must-write-code" }],
        }),
        profile({
          name: "reader",
          keywords: ["reader-kw"],
          suppresses: ["verify", "implement"],
          rules: ["reader-only-rule"],
        }),
      ],
    };
    const cfg = merge(
      [{ profile: bundles.profiles[0]!, score: 1 }, { profile: bundles.profiles[1]!, score: 1 }],
      bundles,
    );
    assert.deepEqual(
      cfg.rules.sort(),
      ["untagged-shared", "reader-only-rule"].sort(),
      `expected tagged rules suppressed, untagged rules kept: ${cfg.rules.join(", ")}`,
    );
  });

  test("tagged rule suppression is order-independent (destructive regardless of matched-array order)", () => {
    const bundles: Bundles = {
      profiles: [
        profile({ name: "writer", keywords: ["writer-kw"], rules: [{ tag: "cleanup", text: "must-cleanup" }] }),
        profile({ name: "reader", keywords: ["reader-kw"], suppresses: ["cleanup"], rules: [] }),
      ],
    };
    const forward = merge([{ profile: bundles.profiles[0]!, score: 1 }, { profile: bundles.profiles[1]!, score: 1 }], bundles);
    const reverse = merge([{ profile: bundles.profiles[1]!, score: 1 }, { profile: bundles.profiles[0]!, score: 1 }], bundles);
    assert.deepEqual(forward.rules, []);
    assert.deepEqual(reverse.rules, []);
  });

  test("a profile's own suppresses does not remove its own untagged or unrelated-tag rules", () => {
    const bundles: Bundles = {
      profiles: [
        profile({
          name: "self",
          keywords: ["self-kw"],
          suppresses: ["verify"],
          rules: ["plain-rule", { tag: "other-tag", text: "unaffected-tag-rule" }, { tag: "verify", text: "self-verify-rule" }],
        }),
      ],
    };
    const cfg = merge(classify("self-kw", bundles), bundles);
    assert.deepEqual(cfg.rules.sort(), ["plain-rule", "unaffected-tag-rule"].sort());
  });

  test("legacy plain-string rules remain fully backward-compatible (never suppressed, unaffected by suppresses)", () => {
    const matches = classify("shared-kw only", fixtureBundles); // alpha/beta/gamma, all plain-string rules, no suppresses
    const cfg = merge(matches, fixtureBundles);
    assert.deepEqual(cfg.rules.sort(), ["alpha-rule", "beta-rule", "gamma-rule"].sort());
  });

  // ---- T2: symmetric suppression (readonly-scope tag) ----

  test("symmetric suppression: co-matched profiles each suppress the other's tagged rule, regardless of order", () => {
    const bundles: Bundles = {
      profiles: [
        profile({
          name: "readonly",
          keywords: ["readonly-kw"],
          suppresses: ["write-scope"],
          rules: ["untagged-shared", { tag: "readonly-scope", text: "edits happen in a separate pass" }],
        }),
        profile({
          name: "writer",
          keywords: ["writer-kw"],
          suppresses: ["readonly-scope"],
          rules: ["untagged-shared", { tag: "write-scope", text: "make the edit now" }],
        }),
      ],
    };
    const forward = merge(
      [{ profile: bundles.profiles[0]!, score: 1 }, { profile: bundles.profiles[1]!, score: 1 }],
      bundles,
    );
    const reverse = merge(
      [{ profile: bundles.profiles[1]!, score: 1 }, { profile: bundles.profiles[0]!, score: 1 }],
      bundles,
    );
    for (const cfg of [forward, reverse]) {
      assert.deepEqual(
        cfg.rules,
        ["untagged-shared"],
        `both tagged rules must be mutually suppressed on co-match, order-independent: ${cfg.rules.join(", ")}`,
      );
    }
  });

  test("symmetric suppression: a profile matched alone still carries its own tagged rule (suppression only fires on co-match)", () => {
    const bundles: Bundles = {
      profiles: [
        profile({
          name: "readonly",
          keywords: ["readonly-kw"],
          suppresses: ["write-scope"],
          rules: [{ tag: "readonly-scope", text: "edits happen in a separate pass" }],
        }),
      ],
    };
    const cfg = merge(classify("readonly-kw", bundles), bundles);
    assert.deepEqual(cfg.rules, ["edits happen in a separate pass"]);
  });

  // ---- T3: shared commonRules ----

  test("commonRules: merged in for a single-profile match alongside its own rules, present exactly once", () => {
    const bundles: Bundles = {
      default: { commonRules: ["shared-truncation-rule"] },
      profiles: [profile({ name: "solo", keywords: ["solo-kw"], rules: ["solo-only-rule"] })],
    };
    const cfg = merge(classify("solo-kw", bundles), bundles);
    assert.deepEqual(cfg.rules.sort(), ["shared-truncation-rule", "solo-only-rule"].sort());
    assert.equal(cfg.rules.filter((r) => r === "shared-truncation-rule").length, 1);
  });

  test("commonRules: deduped when a profile also happens to declare the same text verbatim", () => {
    const bundles: Bundles = {
      default: { commonRules: ["shared-truncation-rule"] },
      profiles: [profile({ name: "solo", keywords: ["solo-kw"], rules: ["shared-truncation-rule", "solo-only-rule"] })],
    };
    const cfg = merge(classify("solo-kw", bundles), bundles);
    assert.equal(cfg.rules.filter((r) => r === "shared-truncation-rule").length, 1);
    assert.deepEqual(cfg.rules.sort(), ["shared-truncation-rule", "solo-only-rule"].sort());
  });

  test("commonRules: also merged into the no-match default fallback path, alongside default.rules", () => {
    const bundles: Bundles = {
      default: { rules: ["default-only-rule"], commonRules: ["shared-truncation-rule"] },
      profiles: [profile({ name: "unrelated", keywords: ["unrelated-kw"] })],
    };
    const cfg = merge([], bundles);
    assert.deepEqual(cfg.rules.sort(), ["default-only-rule", "shared-truncation-rule"].sort());
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

// ---------- bundles.schema.json ----------

describe("bundles.schema.json", () => {
  test("schema file is valid JSON with correct top-level structure", () => {
    const schemaPath = path.join(import.meta.dirname, "..", "bundles.schema.json");
    const schemaContent = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(schemaContent);

    assert.equal(schema.type, "object");
    assert.ok(schema.required);
    assert.ok(schema.required.includes("profiles"));
  });

  test("real bundles.json parses and validateBundles returns no problems", () => {
    const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
    const bundlesContent = fs.readFileSync(bundlesPath, "utf-8");
    const bundles = JSON.parse(bundlesContent) as Bundles;

    // Verify the file loaded successfully with expected structure
    assert.ok(Array.isArray(bundles.profiles));
    assert.ok(bundles.profiles.length > 0);

    // Verify validateBundles finds no problems
    const problems = validateBundles(bundles);
    assert.deepEqual(problems, [], `expected no validation problems, got: ${problems.join("; ")}`);
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
      "give me an overview of the payment flow",
      "summarise the config loading logic",
    ]) {
      const hits = classify(promptText, realBundles);
      assert.ok(hits.length > 0, `expected a match for: "${promptText}"`);
      assert.equal(hits[0]?.profile.name, "lookup", `expected lookup to win "${promptText}"`);
    }
  });

  // "repo"-scoped summarization moved from lookup to investigation under the two-axis
  // scoring surgery (T01-03): lookup.excludeKeywords now disqualifies any "repo"/
  // "repository"/"codebase" prompt (too broad for the cheap, single-file lookup
  // profile), while investigation.scopes gained "repo" as a breadth signal.
  test("whole-repo summarization routes to investigation, not lookup", () => {
    const hits = classify("summarize what this repo does", realBundles);
    assert.ok(hits.length > 0);
    assert.equal(hits[0]?.profile.name, "investigation");
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

    // Assert no blanket edit-prohibition language exists in merged rules. Note: lookup's
    // conditional escape-hatch rule ("If the request exceeds read-only scope, state that
    // and stop...") legitimately mentions "read-only" — that is scoped guidance for lookup
    // alone, not a ban that should block implementation's co-matched write mandate, so it's
    // excluded from this check (see T04-06 "co-matching implementation and lookup" golden test).
    assert.ok(!/is read-only/i.test(rulesJoined), `merged rules must not contain "is read-only": ${rulesJoined}`);
    assert.ok(!/do not (edit|write)/i.test(rulesJoined), `merged rules must not contain "do not edit/write": ${rulesJoined}`);
    assert.ok(!/no (code )?edits?/i.test(rulesJoined), `merged rules must not contain "no edits": ${rulesJoined}`);
  });

  const ESCAPE_HATCH =
    "If the request exceeds read-only scope, state that and stop. Yielding for insufficient scope is a correct outcome, not an incomplete deliverable.";
  const SUPPRESSIBLE_TAGS = ["implement", "verify", "cleanup", "completeness-contract"];

  // Extracts the {tag,text} rule entries actually declared for a profile, ignoring plain strings.
  const taggedRuleTexts = (p: Profile, tags: string[]): string[] =>
    (p.rules ?? [])
      .filter((r): r is { tag: string; text: string } => typeof r !== "string" && tags.includes(r.tag))
      .map((r) => r.text);

  test("T04-06 invariant: every capabilities.write===false profile resolves with no implement/verify/cleanup/completeness-contract rule, alone or co-matched with implementation", () => {
    const implementationProfile = realBundles.profiles.find((p) => p.name === "implementation")!;
    assert.ok(implementationProfile, "fixture must declare an implementation profile");

    const writeFalseProfiles = realBundles.profiles.filter((p) => p.capabilities?.write === false);
    assert.ok(writeFalseProfiles.length > 0, "expected at least one write:false profile in bundles.json");

    for (const p of writeFalseProfiles) {
      for (const matches of [
        [{ profile: p, score: 5 }],
        [{ profile: p, score: 5 }, { profile: implementationProfile, score: 5 }],
      ]) {
        const cfg = merge(matches, realBundles);
        for (const tag of SUPPRESSIBLE_TAGS) {
          const banned = taggedRuleTexts(implementationProfile, [tag]);
          for (const text of banned) {
            assert.ok(
              !cfg.rules.includes(text),
              `profile "${p.name}" (co-matched: ${matches.map((m) => m.profile.name).join("+")}) must not carry implementation's "${tag}"-tagged rule: "${text}"`,
            );
          }
        }
      }
    }
  });

  test("T06 golden: lookup's escape-hatch rule survives suppression, alone and co-matched with implementation", () => {
    const lookupProfile = realBundles.profiles.find((p) => p.name === "lookup")!;
    const implementationProfile = realBundles.profiles.find((p) => p.name === "implementation")!;
    assert.equal(lookupProfile.capabilities?.write, false, "lookup must be capabilities.write===false");
    assert.deepEqual(lookupProfile.suppresses?.slice().sort(), SUPPRESSIBLE_TAGS.slice().sort());

    const alone = merge([{ profile: lookupProfile, score: 5 }], realBundles);
    assert.ok(alone.rules.includes(ESCAPE_HATCH), `lookup alone must include the escape-hatch rule: ${alone.rules.join("\n")}`);

    const coMatched = merge(
      [{ profile: lookupProfile, score: 5 }, { profile: implementationProfile, score: 5 }],
      realBundles,
    );
    assert.ok(
      coMatched.rules.includes(ESCAPE_HATCH),
      `lookup co-matched with implementation must still include the escape-hatch rule: ${coMatched.rules.join("\n")}`,
    );
    // And the write mandates implementation carries must be gone from the resolved set.
    for (const tag of ["implement", "verify", "cleanup"]) {
      for (const text of taggedRuleTexts(implementationProfile, [tag])) {
        assert.ok(!coMatched.rules.includes(text), `co-matched rules must not contain implementation's "${tag}" rule: "${text}"`);
      }
    }
  });

  // ---- T2: symmetric suppression against the real bundles.json ----

  test("T2: readonly-scope tag is symmetric — lookup's scope-statement rule is suppressed when co-matched with a write profile", () => {
    const lookupProfile = realBundles.profiles.find((p) => p.name === "lookup")!;
    const implementationProfile = realBundles.profiles.find((p) => p.name === "implementation")!;
    assert.ok(implementationProfile.suppresses?.includes("readonly-scope"), "implementation must suppress readonly-scope");

    const readonlyScopeTexts = taggedRuleTexts(lookupProfile, ["readonly-scope"]);
    assert.ok(readonlyScopeTexts.length > 0, "lookup must declare a readonly-scope-tagged rule");

    // Alone, lookup's scope statement is present (matches the "lookup alone" golden behavior).
    const alone = merge([{ profile: lookupProfile, score: 5 }], realBundles);
    for (const text of readonlyScopeTexts) assert.ok(alone.rules.includes(text));

    // Co-matched with a write profile, the scope statement must be suppressed — it would
    // otherwise contradict the write profile's live edit mandate.
    const coMatched = merge(
      [{ profile: lookupProfile, score: 5 }, { profile: implementationProfile, score: 5 }],
      realBundles,
    );
    for (const text of readonlyScopeTexts) {
      assert.ok(!coMatched.rules.includes(text), `co-matched rules must not contain lookup's readonly-scope rule: "${text}"`);
    }
    // The conditional escape-hatch rule (untagged) is a different concern and must still survive.
    assert.ok(coMatched.rules.includes(ESCAPE_HATCH));
  });

  test("T2: every capabilities.write===true profile declares suppresses including readonly-scope, symmetric with every write:false profile's readonly-scope rule", () => {
    const writeTrueProfiles = realBundles.profiles.filter((p) => p.capabilities?.write === true);
    assert.ok(writeTrueProfiles.length > 0);
    for (const wp of writeTrueProfiles) {
      assert.ok(wp.suppresses?.includes("readonly-scope"), `write profile "${wp.name}" must suppress "readonly-scope"`);
    }

    const readonlyScopeProfiles = realBundles.profiles.filter((p) =>
      (p.rules ?? []).some((r) => typeof r !== "string" && r.tag === "readonly-scope"),
    );
    assert.ok(readonlyScopeProfiles.length > 0, "at least one profile must declare a readonly-scope rule");

    for (const rp of readonlyScopeProfiles) {
      const texts = taggedRuleTexts(rp, ["readonly-scope"]);
      for (const wp of writeTrueProfiles) {
        const cfg = merge([{ profile: rp, score: 5 }, { profile: wp, score: 5 }], realBundles);
        for (const text of texts) {
          assert.ok(
            !cfg.rules.includes(text),
            `"${rp.name}" co-matched with write profile "${wp.name}" must not carry readonly-scope rule: "${text}"`,
          );
        }
      }
    }
  });

  // ---- T3: shared commonRules against the real bundles.json ----

  test("T3: the truncation rule lives in default.commonRules, not duplicated in any profile's own rules", () => {
    const TRUNCATION_RULE =
      "If a tool result is truncated or suspiciously narrow, NARROW THE QUERY and re-run. NEVER summarise from a truncated result. NEVER infer file contents from file names.";
    assert.ok(realBundles.default?.commonRules?.includes(TRUNCATION_RULE), "default.commonRules must include the truncation rule verbatim");

    for (const p of realBundles.profiles) {
      const ownTexts = (p.rules ?? []).map((r) => (typeof r === "string" ? r : r.text));
      assert.ok(!ownTexts.includes(TRUNCATION_RULE), `profile "${p.name}" must not duplicate the truncation rule in its own rules`);
    }
  });

  test("T3: every profile's resolved rule set carries the truncation rule exactly once", () => {
    const TRUNCATION_RULE =
      "If a tool result is truncated or suspiciously narrow, NARROW THE QUERY and re-run. NEVER summarise from a truncated result. NEVER infer file contents from file names.";
    for (const p of realBundles.profiles) {
      const cfg = merge([{ profile: p, score: 5 }], realBundles);
      const count = cfg.rules.filter((r) => r === TRUNCATION_RULE).length;
      assert.equal(count, 1, `profile "${p.name}" resolved rules must carry the truncation rule exactly once, got ${count}: ${cfg.rules.join(", ")}`);
    }
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

describe("turn-scoped --once pin", () => {
  test("once-pin routes exactly one prompt then auto-clears", async () => {
    await withTempProjectDir(async (dir) => {
      const bundles: Bundles = {
        profiles: [
          profile({ name: "once-target", keywords: ["once-kw"] }),
          profile({ name: "other-profile", keywords: ["other-kw"] }),
        ],
      };
      writeBundles(dir, bundles);

      const { handlers, commands, statuses, ctx } = await installExtension(dir);

      await commands["profile"]!.handler("once-target --once", ctx);

      // Prompt would normally match other-profile, but the once-pin must win.
      await handlers["before_agent_start"]!({ prompt: "other-kw here", systemPrompt: [] }, ctx);
      assert.equal(statuses["profile"], "⚙ once-target (manual, once)");
    });
  });

  test("following prompt after a consumed once-pin is auto-classified and NOT labeled manual", async () => {
    await withTempProjectDir(async (dir) => {
      const bundles: Bundles = {
        profiles: [
          profile({ name: "once-target", keywords: ["once-kw"] }),
          profile({ name: "other-profile", keywords: ["other-kw"] }),
        ],
      };
      writeBundles(dir, bundles);

      const { handlers, commands, statuses, ctx } = await installExtension(dir);

      await commands["profile"]!.handler("once-target --once", ctx);

      // First prompt consumes the once-pin.
      await handlers["before_agent_start"]!({ prompt: "other-kw here", systemPrompt: [] }, ctx);
      assert.equal(statuses["profile"], "⚙ once-target (manual, once)");

      // Second prompt must be auto-classified and NOT labeled manual.
      await handlers["before_agent_start"]!({ prompt: "other-kw again", systemPrompt: [] }, ctx);
      assert.equal(statuses["profile"], "⚙ other-profile");
    });
  });

  test("/profile clear removes an armed-but-unused once-pin", async () => {
    await withTempProjectDir(async (dir) => {
      const bundles: Bundles = {
        profiles: [
          profile({ name: "some-profile", keywords: ["some-kw"] }),
          profile({ name: "different-profile", keywords: ["different-kw"] }),
        ],
      };
      writeBundles(dir, bundles);

      const { handlers, commands, notifications, statuses, ctx } = await installExtension(dir);

      await commands["profile"]!.handler("some-profile --once", ctx);

      // Bare /profile should mention the pending once-pin.
      notifications.length = 0;
      await commands["profile"]!.handler("", ctx);
      assert.ok(
        notifications.some((n) => n.msg.includes("Pending once-pin:")),
        "bare /profile should surface the armed once-pin",
      );

      await commands["profile"]!.handler("clear", ctx);

      // A subsequent prompt for a different profile must auto-classify cleanly.
      await handlers["before_agent_start"]!({ prompt: "different-kw here", systemPrompt: [] }, ctx);
      assert.equal(statuses["profile"], "⚙ different-profile");

      // Bare /profile should no longer mention a pending once-pin.
      notifications.length = 0;
      await commands["profile"]!.handler("", ctx);
      assert.ok(
        !notifications.some((n) => n.msg.includes("Pending once-pin:")),
        "cleared once-pin must not still be reported as pending",
      );
    });
  });

  test("stale once-pinned profile removed before consumption still warns and auto-clears safely", async () => {
    await withTempProjectDir(async (dir) => {
      const bundles: Bundles = {
        profiles: [
          profile({ name: "pinned-once-profile", keywords: ["pin-kw"] }),
          profile({ name: "other-profile", keywords: ["other-kw"] }),
        ],
      };
      writeBundles(dir, bundles);

      const { handlers, commands, notifications, statuses, ctx } = await installExtension(dir);

      // Pin "pinned-once-profile" via /profile <name> --once.
      await commands["profile"]!.handler("pinned-once-profile --once", ctx);

      // Rewrite bundles.json: pinned-once-profile is gone, but a keyword-matching
      // "other-profile" remains so auto-classification finds a real match.
      writeBundles(dir, {
        profiles: [profile({ name: "other-profile", keywords: ["other-kw"] })],
      });

      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "other-kw here", systemPrompt: [] }, ctx);

      assert.equal(statuses["profile"], "⚙ other-profile", "must not append (manual) to an auto-classified profile");
      assert.ok(
        notifications.some((n) => n.msg.includes("no longer exists") && n.level === "warning"),
        "must warn once that the stale once-pin was cleared",
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
      assert.equal(statuses["profile"], "⚙ third-profile", "cleared once-pin must not resurrect pinned profile or relabel");
    });
  });
});

describe("config-change notice", () => {
  test("first load is silent", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "alpha", keywords: ["alpha-kw"] })] });
      const { handlers, notifications, ctx } = await installExtension(dir);

      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "alpha-kw here", systemPrompt: [] }, ctx);

      assert.equal(
        notifications.filter((n) => n.msg.includes("bundles.json changed")).length,
        0,
        "first load should not emit a change notice",
      );
    });
  });

  test("changed content notifies once with 12-hex hash", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "alpha", keywords: ["alpha-kw"] })] });
      const { handlers, notifications, ctx } = await installExtension(dir);

      // First load (silent)
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "alpha-kw first", systemPrompt: [] }, ctx);
      assert.equal(
        notifications.filter((n) => n.msg.includes("bundles.json changed")).length,
        0,
        "first load should be silent",
      );

      // Rewrite with different content
      writeBundles(dir, { profiles: [profile({ name: "beta", keywords: ["beta-kw"] })] });

      // Second load with changed content
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "beta-kw second", systemPrompt: [] }, ctx);

      const changeNotice = notifications.find((n) => n.msg.includes("bundles.json changed"));
      assert.ok(changeNotice, "should emit a change notice");
      assert.equal(changeNotice!.level, "info", "change notice should be at info level");
      assert.ok(
        /bundles\.json changed \([0-9a-f]{12}\) — applied/.test(changeNotice!.msg),
        `message should match pattern, got: ${changeNotice!.msg}`,
      );
    });
  });

  test("unchanged content is silent on reload", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "alpha", keywords: ["alpha-kw"] })] });
      const { handlers, notifications, ctx } = await installExtension(dir);

      // First load (silent)
      await handlers["before_agent_start"]!({ prompt: "alpha-kw first", systemPrompt: [] }, ctx);

      // Change and reload to set lastConfigHash
      writeBundles(dir, { profiles: [profile({ name: "beta", keywords: ["beta-kw"] })] });
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "beta-kw second", systemPrompt: [] }, ctx);
      assert.ok(
        notifications.some((n) => n.msg.includes("bundles.json changed")),
        "second load should notify change",
      );

      // Third load without changing the file
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "beta-kw third", systemPrompt: [] }, ctx);
      assert.equal(
        notifications.filter((n) => n.msg.includes("bundles.json changed")).length,
        0,
        "unchanged content should not emit a notice on reload",
      );
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

describe("/profile explain", () => {
  test("emits a trace notification for the given prompt without mutating state", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({ name: "winner", keywords: ["test-kw"] }),
          profile({ name: "other", keywords: ["other-kw"] }),
        ],
      });
      const { commands, handlers, notifications, statuses, setModelCalls, ctx } = await installExtension(dir);

      // Call explain subcommand with a multi-word prompt containing the keyword
      notifications.length = 0;
      await commands["profile"]!.handler("explain this is a test-kw prompt", ctx);

      // Should emit exactly one notification with the trace
      assert.equal(notifications.length, 1);
      const trace = notifications[0]!;
      assert.equal(trace.level, "info");
      assert.ok(trace.msg.includes("Profile routing"), "header should mention routing");
      assert.ok(trace.msg.includes("winner"), "should name the winning profile");
      assert.ok(trace.msg.includes("test-kw"), "should show the matched keyword");
      assert.ok(trace.msg.includes("← chosen"), "should mark the winner");

      // Verify state was not mutated by the explain call
      assert.equal(setModelCalls.length, 0, "should not have called setModel");

      // Now send a real prompt to classify and set the status
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "other-kw here", systemPrompt: [] }, ctx);

      // Status should reflect the real classification, not influenced by the explain call
      assert.equal(statuses["profile"], "⚙ other", "status should reflect actual classification, not explain");
    });
  });

  test("shows a usage message when no text provided", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "test", keywords: ["test-kw"] })] });
      const { commands, notifications, ctx } = await installExtension(dir);

      notifications.length = 0;
      await commands["profile"]!.handler("explain", ctx);

      // Should emit a usage message
      assert.equal(notifications.length, 1);
      const msg = notifications[0]!;
      assert.equal(msg.level, "warning");
      assert.ok(msg.msg.includes("Usage"), "should show usage");
      assert.ok(msg.msg.includes("/profile explain"), "should mention the command");
    });
  });
});

describe("/profile misroute", () => {
  test("after a prompt is classified, /profile misroute writes correct JSON shape to .omp/misroutes.jsonl", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({ name: "alpha", keywords: ["alpha-kw"] }),
          profile({ name: "beta", keywords: ["beta-kw"] }),
        ],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);

      // Classify a prompt first
      notifications.length = 0;
      await handlers["before_agent_start"]!({ prompt: "alpha-kw test prompt", systemPrompt: [] }, ctx);

      // Now log a misroute
      notifications.length = 0;
      await commands["profile"]!.handler("misroute beta", ctx);

      // Verify file was created and contains the correct JSON
      const logPath = path.join(dir, ".omp", "misroutes.jsonl");
      assert.ok(fs.existsSync(logPath), "misroutes.jsonl should exist");

      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n");
      assert.equal(lines.length, 1, "should have exactly one line");

      const entry = JSON.parse(lines[0]!);
      assert.ok(entry.ts, "ts field should be present");
      assert.ok(new Date(entry.ts).getTime(), "ts should be a valid ISO8601 date");
      assert.equal(entry.prompt, "alpha-kw test prompt", "prompt should match");
      assert.deepEqual(entry.matched, ["alpha"], "matched should contain matched profile names");
      assert.equal(entry.expected, "beta", "expected should be the provided profile name");

      // Verify success notification
      assert.ok(
        notifications.some((n) => n.level === "info" && n.msg.includes("misroutes.jsonl")),
        "should emit info notification with path",
      );
    });
  });

  test("/profile misroute with unknown expected-profile emits error notification and does not write file", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "known-profile", keywords: ["kw"] })],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);

      // Classify first
      await handlers["before_agent_start"]!({ prompt: "kw here", systemPrompt: [] }, ctx);

      // Try to misroute with unknown profile
      notifications.length = 0;
      await commands["profile"]!.handler("misroute unknown-profile", ctx);

      // Should emit error
      assert.ok(
        notifications.some((n) => n.level === "error" && n.msg.includes("unknown-profile")),
        "should emit error for unknown profile",
      );

      // File should NOT be created
      const logPath = path.join(dir, ".omp", "misroutes.jsonl");
      assert.equal(fs.existsSync(logPath), false, "misroutes.jsonl should not be created on error");
    });
  });

  test("/profile misroute with no prior classification emits warning and does not write file", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "test", keywords: ["kw"] })],
      });
      const { commands, notifications, ctx } = await installExtension(dir);

      // Call misroute without any prior classification
      notifications.length = 0;
      await commands["profile"]!.handler("misroute", ctx);

      // Should emit warning
      assert.ok(
        notifications.some((n) => n.level === "warning" && n.msg === "nothing to log"),
        "should emit warning when no prompt classified",
      );

      // File should NOT be created
      const logPath = path.join(dir, ".omp", "misroutes.jsonl");
      assert.equal(fs.existsSync(logPath), false, "misroutes.jsonl should not be created when no prompt");
    });
  });
});

describe("/profile stats", () => {
  test("zero activity -> exact 'no prompts classified yet' info message", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "alpha", keywords: ["alpha-kw"] })] });
      const { commands, notifications, ctx } = await installExtension(dir);

      notifications.length = 0;
      await commands["profile"]!.handler("stats", ctx);

      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]!.level, "info");
      assert.equal(notifications[0]!.msg, "no prompts classified yet");
    });
  });

  test("counts prompts per profile (including default) and manual pins across driven turns", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({ name: "alpha", keywords: ["alpha-kw"] }),
          profile({ name: "beta", keywords: ["beta-kw"] }),
        ],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);

      // Two prompts matching "alpha", one totally unmatched prompt -> "default".
      // (The unmatched prompt must be >=6 tokens so T01-03 stickiness — which
      // inherits the previous turn's profile for short/continuation follow-ups
      // with no qualifying match — doesn't pull it into "alpha" instead.)
      await handlers["before_agent_start"]!({ prompt: "alpha-kw please", systemPrompt: [] }, ctx);
      await handlers["before_agent_start"]!({ prompt: "alpha-kw again", systemPrompt: [] }, ctx);
      await handlers["before_agent_start"]!({ prompt: "completely unrelated gibberish text with nothing relevant here", systemPrompt: [] }, ctx);

      // One successful manual pin.
      await commands["profile"]!.handler("beta", ctx);

      notifications.length = 0;
      await commands["profile"]!.handler("stats", ctx);

      assert.equal(notifications.length, 1);
      const msg = notifications[0]!;
      assert.equal(msg.level, "info");
      assert.ok(msg.msg.includes("alpha: 2"), `expected "alpha: 2" in stats, got: ${msg.msg}`);
      assert.ok(msg.msg.includes("default: 1"), `expected "default: 1" in stats, got: ${msg.msg}`);
      assert.ok(msg.msg.includes("Manual pins set: 1"), `expected "Manual pins set: 1" in stats, got: ${msg.msg}`);
      assert.ok(msg.msg.includes("Model switches accepted: 0"), `expected model switch counters at 0, got: ${msg.msg}`);
      assert.ok(msg.msg.includes("Model switches declined: 0"), `expected model switch counters at 0, got: ${msg.msg}`);
    });
  });

  test("model switch counters increment on accepted and declined confirm decisions (bonus)", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [profile({ name: "chain-profile", keywords: ["chain-kw"], model: "anthropic/claude-sonnet-5" })],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);
      const sonnet = { id: "claude-sonnet-5", provider: "anthropic", name: "Sonnet" };
      const opus = { id: "claude-opus-4-8", provider: "anthropic", name: "Opus" };
      ctx.models.resolve = ((spec: string) => (spec === "anthropic/claude-sonnet-5" ? sonnet : undefined)) as never;

      // First turn: current model differs from resolved -> a switch is proposed; fake confirm defaults to true -> accepted.
      await handlers["before_agent_start"]!({ prompt: "chain-kw here", systemPrompt: [] }, ctx);

      // Second turn: force a *different* current model (so `changed` is true again, a fresh from->to
      // key) and make ctx.ui.confirm resolve false -> declined.
      ctx.ui.confirm = async () => false;
      ctx.model = opus as never;
      await handlers["before_agent_start"]!({ prompt: "chain-kw once more", systemPrompt: [] }, ctx);

      notifications.length = 0;
      await commands["profile"]!.handler("stats", ctx);
      const statsMsg = notifications.find((n) => n.msg.startsWith("Profile stats"));
      assert.ok(statsMsg, "expected a stats notification");
      assert.ok(statsMsg!.msg.includes("Model switches accepted: 1"), `expected 1 accepted switch, got: ${statsMsg!.msg}`);
      assert.ok(statsMsg!.msg.includes("Model switches declined: 1"), `expected 1 declined switch, got: ${statsMsg!.msg}`);
    });
  });
});

describe("/profile rules", () => {
  test("after classifying a profile with rules and skills, /profile rules notifies the exact injection block string", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({
            name: "test-profile",
            keywords: ["test-kw"],
            rules: ["test-rule-one", "test-rule-two"],
            skills: ["test-skill"],
          }),
        ],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);

      // Classify a prompt with the profile
      const beforeAgentStartResult = (await handlers["before_agent_start"]!({ prompt: "test-kw here", systemPrompt: [] }, ctx)) as
        | { systemPrompt?: string[] }
        | undefined;
      assert.ok(beforeAgentStartResult?.systemPrompt, "before_agent_start should return a systemPrompt array");
      const injectedBlock = beforeAgentStartResult.systemPrompt![beforeAgentStartResult.systemPrompt!.length - 1];

      // Now call /profile rules and verify the exact string matches
      notifications.length = 0;
      await commands["profile"]!.handler("rules", ctx);

      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]!.level, "info");
      assert.equal(
        notifications[0]!.msg,
        injectedBlock,
        "the /profile rules output must exactly match what before_agent_start injected",
      );
    });
  });

  test("active === null (no classification yet) -> notifies 'No classification yet — send a prompt first'", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, { profiles: [profile({ name: "test", keywords: ["test-kw"] })] });
      const { commands, notifications, ctx } = await installExtension(dir);

      notifications.length = 0;
      await commands["profile"]!.handler("rules", ctx);

      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]!.level, "info");
      assert.equal(notifications[0]!.msg, "No classification yet — send a prompt first");
    });
  });

  test("profile with empty rules and empty skills -> notifies explicit 'no rules or skills declared' message", async () => {
    await withTempProjectDir(async (dir) => {
      writeBundles(dir, {
        profiles: [
          profile({
            name: "norules",
            keywords: ["norules-kw"],
            rules: [],
            skills: [],
          }),
        ],
      });
      const { handlers, commands, notifications, ctx } = await installExtension(dir);

      // Classify a prompt first
      await handlers["before_agent_start"]!({ prompt: "norules-kw here", systemPrompt: [] }, ctx);

      // Now call /profile rules
      notifications.length = 0;
      await commands["profile"]!.handler("rules", ctx);

      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]!.level, "info");
      assert.ok(
        notifications[0]!.msg.includes("No rules or skills declared for the active profile (norules)"),
        `expected explicit message, got: ${notifications[0]!.msg}`,
      );
    });
  });
});

// ---------- T5: larger, realistic regression fixture (paraphrases, near-misses, multi-match) ----------

describe("routing-expectations fixture: semantic-overlap regression", () => {
  const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
  const realBundles = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;

  const fixturePath = path.join(import.meta.dirname, "fixtures", "routing-expectations.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
    prompt: string;
    expected: string;
    note?: string;
  }[];

  /** Formats every profile's score + matched keywords (not just the winner) for a debuggable failure message. */
  function formatFullTrace(prompt: string): string {
    const rows = explain(prompt, realBundles);
    const header = `explain("${prompt}"):`;
    const body = rows
      .map((r) => `  ${r.name} (order ${r.order}): score=${r.score} matched=[${r.matched.join(", ")}]`)
      .join("\n");
    return `${header}\n${body}`;
  }

  fixture.forEach((entry, i) => {
    test(`[${i}] "${entry.prompt}" -> expected "${entry.expected}"${entry.note ? ` (${entry.note})` : ""}`, () => {
      const hits = classify(entry.prompt, realBundles);
      const trace = formatFullTrace(entry.prompt);

      if (entry.expected === "default") {
        assert.equal(hits.length, 0, trace);
      } else {
        assert.equal(hits[0]?.profile.name, entry.expected, trace);
      }
    });
  });
});

// ---------- T01-03: two-axis scoring (verbs/scopes/excludeKeywords) + stickiness ----------

describe("T01-03: two-axis scoring routing", () => {
  const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
  const realBundles = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;

  test('"explore and explain this repository" -> investigation (lookup disqualified by excludeKeywords "repository")', () => {
    const hits = classify("explore and explain this repository", realBundles);
    assert.equal(hits[0]?.profile.name, "investigation");
  });

  test('"explain this function" -> lookup (verb + code-element scope)', () => {
    const hits = classify("explain this function", realBundles);
    assert.equal(hits[0]?.profile.name, "lookup");
  });

  test('"explain the auth flow" -> lookup (verb + "auth flow" scope)', () => {
    const hits = classify("explain the auth flow", realBundles);
    assert.equal(hits[0]?.profile.name, "lookup");
  });

  test('"what does this repo do" -> investigation ("repo" scope; lookup disqualified by excludeKeywords)', () => {
    const hits = classify("what does this repo do", realBundles);
    assert.equal(hits[0]?.profile.name, "investigation");
  });

  test('"fix the failing test" -> implementation ("failing test" keyword)', () => {
    const hits = classify("fix the failing test", realBundles);
    assert.equal(hits[0]?.profile.name, "implementation");
  });

  test("stickiness: short/continuation follow-ups inherit the previous turn's profile", () => {
    const first = classify("investigate the root cause of why this test is flaky, trace through the logs", realBundles);
    assert.equal(first[0]?.profile.name, "investigation");

    const second = classify("ok go on", realBundles, first[0]!.profile.name);
    assert.equal(second[0]?.profile.name, "investigation");
    assert.equal(second[0]?.inherited, true, "should be marked inherited, not freshly classified");

    const third = classify("continue", realBundles, second[0]!.profile.name);
    assert.equal(third[0]?.profile.name, "investigation");
    assert.equal(third[0]?.inherited, true, "should be marked inherited, not freshly classified");
  });
});

// ---------- T09: golden regression fixtures locking in exact prod failures ----------

describe("golden: prod-failure regression lock", () => {
  const bundlesPath = path.join(import.meta.dirname, "..", "bundles.json");
  const realBundles = JSON.parse(fs.readFileSync(bundlesPath, "utf-8")) as Bundles;

  test('golden #1: "explain this repo - optimal scan use micro sub-agents or tools" -> investigation', () => {
    const hits = classify("explain this repo - optimal scan use micro sub-agents or tools", realBundles);
    assert.equal(hits[0]?.profile.name, "investigation");
  });

  test('golden #2: "ok, go on" as turn 2 after golden #1 -> investigation, inherited via stickiness', () => {
    const first = classify("explain this repo - optimal scan use micro sub-agents or tools", realBundles);
    assert.equal(first[0]?.profile.name, "investigation");

    const second = classify("ok, go on", realBundles, first[0]!.profile.name);
    assert.equal(second[0]?.profile.name, "investigation");
    assert.equal(second[0]?.inherited, true, "should be marked inherited, not freshly classified");
  });

  test('golden #3: "explore and explain this repository" -> investigation', () => {
    const hits = classify("explore and explain this repository", realBundles);
    assert.equal(hits[0]?.profile.name, "investigation");
  });

  test("golden #4: lookup's RESOLVED rule set (alone) carries zero implement/verify/cleanup-tagged rules", () => {
    const lookupProfile = realBundles.profiles.find((p) => p.name === "lookup")!;
    assert.ok(lookupProfile, "fixture must declare a lookup profile");

    const resolved = merge([{ profile: lookupProfile, score: 5 }], realBundles);
    const mandateLike = resolved.rules.filter((r) =>
      /\b(implement|write code|verify|run (tests|npm)|clean ?up|complete(ness)?[- ]contract)\b/i.test(r),
    );
    assert.deepEqual(
      mandateLike,
      [],
      `lookup's resolved rules must mandate no write/verify/cleanup action: ${JSON.stringify(resolved.rules)}`,
    );
  });

  test("golden #5: semantic-overlap lookup+implementation co-match -> no contradictory write mandates survive; escape-hatch present, read-only wins", () => {
    const lookupProfile = realBundles.profiles.find((p) => p.name === "lookup")!;
    const implementationProfile = realBundles.profiles.find((p) => p.name === "implementation")!;

    const resolved = merge(
      [{ profile: lookupProfile, score: 5 }, { profile: implementationProfile, score: 5 }],
      realBundles,
    );
    const rulesJoined = resolved.rules.join("\n");

    // Escape hatch (untagged, never suppressed) must survive.
    assert.ok(
      /exceeds read-only scope, state that and stop/i.test(rulesJoined),
      `co-matched resolved rules must retain lookup's escape-hatch rule: ${rulesJoined}`,
    );

    // Implementation's tagged write/verify/cleanup mandates must not survive lookup's suppresses.
    const bannedTags = ["implement", "verify", "cleanup"];
    const bannedTexts = (implementationProfile.rules ?? [])
      .filter((r): r is { tag: string; text: string } => typeof r !== "string" && bannedTags.includes(r.tag))
      .map((r) => r.text);
    for (const text of bannedTexts) {
      assert.ok(!resolved.rules.includes(text), `co-matched resolved rules must not contain suppressed rule: "${text}"`);
    }
  });
});
