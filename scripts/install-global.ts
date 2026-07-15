// Copies the extension + its config from this repo to the global OMP paths
// (MANUAL.md §1). Deliberately a copy, not a symlink: symlinks need admin on
// Windows, and hardlinks detach silently when git rewrites a file on checkout.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const omp = path.join(os.homedir(), ".omp");

const targets: ReadonlyArray<readonly [source: string, dest: string]> = [
  ["profile-router.ts", path.join(omp, "agent", "extensions", "profile-router.ts")],
  ["bundles.json", path.join(omp, "bundles.json")],
  ["bundles.schema.json", path.join(omp, "bundles.schema.json")],
];

const hash = (file: string): string | null =>
  fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 12) : null;

const checkOnly = process.argv.includes("--check");
let drifted = 0;

for (const [name, dest] of targets) {
  const source = path.join(repo, name);
  if (!fs.existsSync(source)) {
    console.error(`✗ ${name} — missing from repo`);
    process.exit(1);
  }

  const from = hash(source);
  const to = hash(dest);
  if (from === to) {
    console.log(`= ${name} — up to date (${from})`);
    continue;
  }

  drifted++;
  if (checkOnly) {
    console.log(`≠ ${name} — ${to === null ? "not installed" : `stale (${to} → ${from})`}`);
    continue;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(source, dest);
  console.log(`→ ${name} — ${to === null ? "installed" : "updated"} (${from})\n  ${dest}`);
}

if (checkOnly && drifted > 0) {
  console.error(`\n${drifted} file(s) out of sync. Run: npm run install:global`);
  process.exit(1);
}

if (drifted > 0) console.log("\nRestart your OMP session (or /reload) to pick up the changes.");
else console.log("\nNothing to do — global install already matches the repo.");
