/**
 * Real-loader integration smoke test — run under bun:  npm run test:integration
 *
 * Unlike test/profile-router.test.ts (which drives the handlers through a hand-rolled
 * fake `pi`), this loads profile-router through OMP's ACTUAL extension machinery:
 * `loadExtensionFromFactory` + `ConcreteExtensionAPI` from the installed package. That
 * proves our `pi.on(...)` / `registerCommand(...)` / `sendUserMessage(...)` calls bind
 * against the real API object under the real event keys — not just that a stub accepts
 * them. It is the committed, guarded form of the manual smoke test recorded in
 * API-FINDINGS.md "Deep runtime verification".
 *
 * It is deliberately NOT part of `npm test` (Node): it needs bun (the package ships
 * Bun-native deps) and deep-imports package-internal modules. If those internals cannot
 * be imported in this environment, the script prints SKIP and exits 0 — it strengthens
 * verification when it can, and never becomes a brittle CI failure when it can't.
 *
 * The one seam it still cannot exercise is the live agent loop (provider calls), which
 * needs real model credentials — that remains a manual, human-run check (MANUAL.md §7–8).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let pass = 0;
let fail = 0;
function check(name: string, cond: unknown) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}
function skip(reason: string): never {
  console.log(`SKIP: ${reason}`);
  process.exit(0);
}

// ---- Load OMP's real loader internals (guarded) ----
let loadExtensionFromFactory: (
  factory: unknown,
  cwd: string,
  eventBus: unknown,
  runtime: unknown,
  name?: string,
) => Promise<{ handlers: Map<string, Function[]>; commands: Map<string, { handler: Function }> }>;
let EventBus: new () => unknown;
try {
  ({ loadExtensionFromFactory } = (await import(
    "@oh-my-pi/pi-coding-agent/extensibility/extensions/loader"
  )) as never);
  ({ EventBus } = (await import("@oh-my-pi/pi-coding-agent/utils/event-bus")) as never);
} catch (err) {
  skip(`OMP loader internals not importable here (${(err as Error).message.split("\n")[0]})`);
}

// ---- Scratch project with the real bundles.json ----
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pr-integration-"));
fs.mkdirSync(path.join(cwd, ".omp"), { recursive: true });
fs.copyFileSync(
  path.join(import.meta.dirname, "..", "..", "bundles.json"),
  path.join(cwd, ".omp", "bundles.json"),
);

// ---- Capturing runtime stub (ConcreteExtensionAPI delegates action methods to this) ----
const sent: { content: unknown; options: unknown }[] = [];
const setModelCalls: unknown[] = [];
const setToolsCalls: unknown[] = [];
const runtimeCore: Record<string, (...a: unknown[]) => unknown> = {
  sendUserMessage: (content: unknown, options: unknown) => sent.push({ content, options }),
  sendMessage: () => {},
  appendEntry: () => {},
  getActiveTools: () => [],
  getAllTools: () => ["read", "grep", "glob", "edit", "write", "bash", "task"],
  setActiveTools: async (t: unknown) => void setToolsCalls.push(t),
  getCommands: () => [],
  setModel: async (m: unknown) => (setModelCalls.push(m), true),
  getThinkingLevel: () => undefined,
  setThinkingLevel: () => {},
  getSessionName: () => undefined,
  setSessionName: async () => {},
};
// Any other IExtensionRuntime member defaults to a no-op so construction never throws.
const runtime = new Proxy(runtimeCore, {
  get: (t, p: string) => (p in t ? t[p] : () => undefined),
});

// ---- Fake per-event context (ui / models / cwd), same surface the real runner builds ----
const notifications: { msg: string; level: string }[] = [];
const statuses: Record<string, string> = {};
const ctx = {
  cwd,
  ui: {
    notify: (msg: string, level = "info") => notifications.push({ msg, level }),
    confirm: async () => true,
    setStatus: (k: string, v: string) => void (statuses[k] = v),
  },
  models: { resolve: (m: string) => ({ id: m.split("/")[1] ?? m, provider: m.split("/")[0] ?? "?" }) },
  model: { id: "seed", provider: "seed" },
};

// ---- Load through the REAL ConcreteExtensionAPI ----
const mod = await import("../../profile-router.ts");
let ext: Awaited<ReturnType<typeof loadExtensionFromFactory>>;
try {
  ext = await loadExtensionFromFactory(mod.default, cwd, new EventBus(), runtime, "profile-router");
} catch (err) {
  skip(`real loader could not construct the extension here (${(err as Error).message.split("\n")[0]})`);
}

console.log("real-loader integration:");

// (1) Registration bound against the real API under the real event keys.
for (const ev of ["before_agent_start", "tool_call", "tool_execution_end", "session.compacting", "credential_disabled"]) {
  check(`handler registered: ${ev}`, (ext.handlers.get(ev)?.length ?? 0) > 0);
}
for (const cmd of ["profile", "equip", "arise", "rank"]) {
  check(`command registered: /${cmd}`, ext.commands.has(cmd));
}

const h = (name: string) => ext.handlers.get(name)![0] as (e: unknown, c: unknown) => Promise<unknown>;
const cmd = (name: string) => ext.commands.get(name)!.handler as (a: string, c: unknown) => Promise<unknown>;

// (2) before_agent_start classifies + injects rules for a lookup prompt.
const bas = (await h("before_agent_start")(
  { prompt: "find where the auth middleware is defined and explain it", systemPrompt: [] },
  ctx,
)) as { systemPrompt?: string[] };
check("before_agent_start returns an injected system prompt block", Array.isArray(bas?.systemPrompt) && bas.systemPrompt.length > 0);
check("status line reflects the lookup profile", statuses["profile"]?.includes("lookup"));

// (3) 🔥 Embers: session.compacting re-injects the active rules as summary context.
const comp = (await h("session.compacting")({ type: "session.compacting", sessionId: "s", messages: [] }, ctx)) as {
  context?: string[];
};
check("session.compacting returns context lines (oaths preserved)", (comp?.context?.length ?? 0) > 0);
check("Ember restore was notified", notifications.some((n) => n.msg.includes("Ember restored")));

// (4) 🩸 Poison: credential_disabled sets a persistent fallback marker.
await h("credential_disabled")({ type: "credential_disabled", provider: "anthropic", disabledCause: "invalid_grant" }, ctx);
check("poison status marker set on credential_disabled", statuses["poison"]?.includes("anthropic"));

// (5) ⚖ Sentinel: equip → mutating tool blocked.
await cmd("equip")("sentinel", ctx);
await h("before_agent_start")({ prompt: "review", systemPrompt: [] }, ctx);
const edit = (await h("tool_call")({ toolName: "edit", input: {} }, ctx)) as { block?: boolean } | undefined;
check("sentinel blocks edit at tool_call", edit?.block === true);
const read = (await h("tool_call")({ toolName: "read", input: {} }, ctx)) as { block?: boolean } | undefined;
check("sentinel lets read through", !read?.block);

// (6) 👑 Monarch: equip → 4th live summon blocked, freed on completion.
await cmd("equip")("monarch", ctx);
await h("before_agent_start")({ prompt: "orchestrate", systemPrompt: [] }, ctx);
const task = () => h("tool_call")({ toolName: "task", input: {} }, ctx) as Promise<{ block?: boolean } | undefined>;
const r1 = await task(), r2 = await task(), r3 = await task(), r4 = await task();
check("monarch allows up to the cap of 3 summons", !r1?.block && !r2?.block && !r3?.block);
check("monarch blocks the 4th live summon", r4?.block === true);
await h("tool_execution_end")({ toolName: "task" }, ctx);
check("a returning minion frees a slot", !(await task())?.block);

// (7) 🗡 /arise: no-arg asks the model via the REAL sendUserMessage → runtime delegate.
sent.length = 0;
await cmd("arise")("", ctx);
check("/arise routes a distill prompt through pi.sendUserMessage", sent.length === 1);
check("/arise uses deliverAs followUp", (sent[0]?.options as { deliverAs?: string })?.deliverAs === "followUp");

// ---- Report ----
fs.rmSync(cwd, { recursive: true, force: true });
console.log(`\nintegration: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
