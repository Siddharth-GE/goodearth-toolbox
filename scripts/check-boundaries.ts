/**
 * The toolbox rule (CLAUDE.md): one tool never imports another tool's code,
 * and shared code never imports a tool's. lib/overview/ is the one module
 * allowed to read other tools' queries; lib/turing/ the one allowed to call
 * other tools' action files (lib/<tool>/actions.ts or <name>-actions.ts).
 *
 *   npx tsx scripts/check-boundaries.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const ROOT = process.cwd();

/** Tool folders, from the registry. Masters and its lib/ are shared surfaces; Training has no code. */
const TOOLS = new Set(
  [...readFileSync(join(ROOT, "lib/tools.ts"), "utf8").matchAll(/href: "\/([a-z-]+)"/g)]
    .map((match) => match[1])
    .filter((tool) => tool !== "masters" && tool !== "training"),
);

/** Doors that live outside a tool's folders: the Google Chat door is Relay's, the public deck viewer Dexter's. */
const DOORS: Record<string, string> = { "google-chat": "relay" };

function owner(file: string): string | null {
  const path = relative(ROOT, file).split("\\").join("/");
  if (path.startsWith("app/deck/")) return "dexter";
  const match =
    path.match(/^lib\/([a-z-]+)\//) ??
    path.match(/^app\/\(dashboard\)\/([a-z-]+)\//) ??
    path.match(/^app\/api\/([a-z-]+)\//);
  if (!match) return null;
  const folder = DOORS[match[1]] ?? match[1];
  return TOOLS.has(folder) ? folder : null;
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

function resolveImport(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return join(ROOT, specifier.slice(2));
  if (specifier.startsWith(".")) return normalize(join(dirname(from), specifier));
  return null;
}

const problems: string[] = [];
for (const file of ["app", "lib", "components"].flatMap((dir) => files(join(ROOT, dir)))) {
  const mine = owner(file);
  const path = relative(ROOT, file).split("\\").join("/");
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
    const target = resolveImport(file, match[1]);
    if (!target) continue;
    const theirs = owner(target + "/x") ?? owner(target);
    if (!theirs || theirs === mine) continue;
    if (path.startsWith("lib/overview/")) continue;
    // Turing presses a tool's own save after the admin's Save: its action files, and nothing else of the tool's.
    const into = relative(ROOT, target).split("\\").join("/");
    if (path.startsWith("lib/turing/") && /^lib\/[a-z-]+\/([a-z-]+-)?actions$/.test(into)) continue;
    problems.push(
      mine
        ? `${path}: ${mine} imports ${theirs}'s code (${match[1]})`
        : `${path}: shared code imports ${theirs}'s code (${match[1]})`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\n${problems.length} import(s) cross a tool's boundary.`);
  process.exitCode = 1;
} else {
  console.log("No tool imports another tool's code.");
}
