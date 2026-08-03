/**
 * Guards against the failure that took production down on 2026-08-03.
 *
 * A bare `export type { X };` in a "use server" file compiles fine and
 * builds fine — then kills EVERY action in its chunk at module load with
 * "X is not defined". Pages still render, so nothing looks wrong until
 * somebody presses a save button. It went unnoticed for two days.
 *
 * `tsc`, ESLint, the tests and `next build` were all green throughout,
 * which is why this exists as its own check. Two passes:
 *
 *   1. SOURCE — refuse the pattern in any "use server" file.
 *   2. COMPILED — scan the built chunks for its fingerprint, so a form
 *      the source pass hasn't thought of is still caught.
 *
 * Run after `npm run build` so both passes have something to look at.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "lib", "components"];
const BUILD_DIR = join(".next", "server");

type Problem = { file: string; line: number; detail: string };

function walk(dir: string, match: (name: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, out);
    else if (match(entry)) out.push(full);
  }
  return out;
}

/** A file-level "use server" directive — the only kind that matters here. */
function isServerActionFile(source: string): boolean {
  for (const raw of source.split("\n").slice(0, 30)) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    return /^["']use server["'];?$/.test(line);
  }
  return false;
}

/**
 * Both re-export forms: `export type { X }` and `export { type X }`.
 *
 * Only lines that actually START a statement are considered — the
 * codebase deliberately mentions this pattern in comments explaining why
 * it's banned, and those must not trip the check.
 */
function findTypeReExports(source: string): { line: number; detail: string }[] {
  const lines = source.split("\n");
  const found: { line: number; detail: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("export")) continue;

    if (/^export\s+type\s*\{/.test(line)) {
      found.push({ line: i + 1, detail: line.slice(0, 90) });
      continue;
    }

    if (/^export\s*\{/.test(line)) {
      // An export block can span lines: `export {\n  type Foo,\n};`
      let block = line;
      let j = i;
      while (!block.includes("}") && j + 1 < lines.length && j - i < 20) {
        j += 1;
        block += " " + lines[j].trim();
      }
      if (/\btype\s+[A-Za-z_$]/.test(block)) {
        found.push({ line: i + 1, detail: block.slice(0, 90) });
      }
    }
  }
  return found;
}

function checkSource(): Problem[] {
  const problems: Problem[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(
      join(ROOT, dir),
      (name) => name.endsWith(".ts") || name.endsWith(".tsx"),
    )) {
      const source = readFileSync(file, "utf8");
      if (!isServerActionFile(source)) continue;
      for (const hit of findTypeReExports(source)) {
        problems.push({ file: relative(ROOT, file), line: hit.line, detail: hit.detail });
      }
    }
  }
  return problems;
}

/**
 * The compiled fingerprint.
 *
 * Turbopack emits every server action module's exports as
 * `ensureServerEntryExports([i,j,k,…])`, where the real actions are
 * minified to short local identifiers. A type that doesn't exist at
 * runtime can't be minified, so it survives in that list as its original
 * PascalCase name — and evaluating the array throws on module load.
 *
 * Verified against a deliberately broken build before being trusted.
 */
const EXPORT_LIST = /ensureServerEntryExports[^[]{0,40}\[([^\]]{0,4000})\]/g;
const LOOKS_LIKE_A_TYPE = /^[A-Z][A-Za-z0-9_$]+$/;

function checkBuild(): { problems: Problem[]; listsSeen: number } {
  const problems: Problem[] = [];
  let listsSeen = 0;

  for (const file of walk(join(ROOT, BUILD_DIR), (name) => name.endsWith(".js"))) {
    const code = readFileSync(file, "utf8");
    if (!code.includes("ensureServerEntryExports")) continue;

    for (const match of code.matchAll(EXPORT_LIST)) {
      listsSeen += 1;
      for (const entry of match[1].split(",")) {
        const name = entry.trim();
        if (name && LOOKS_LIKE_A_TYPE.test(name)) {
          problems.push({
            file: relative(ROOT, file),
            line: 0,
            detail: `"${name}" is exported at runtime but has no runtime value`,
          });
        }
      }
    }
  }
  return { problems, listsSeen };
}

// ---------------------------------------------------------------------

const sourceProblems = checkSource();
let failed = false;

if (sourceProblems.length > 0) {
  failed = true;
  console.error('\n✗ Type re-export in a "use server" file\n');
  for (const problem of sourceProblems) {
    console.error(`  ${problem.file}:${problem.line}`);
    console.error(`    ${problem.detail}`);
  }
  console.error(
    "\n  This builds cleanly and then kills every action in its chunk at",
    "\n  runtime. Import the type directly from where it's declared instead.",
    "\n  Declaring an alias (export type Foo = …) is fine; re-exporting is not.\n",
  );
} else {
  console.log('✓ source: no type re-exports in "use server" files');
}

if (!existsSync(join(ROOT, BUILD_DIR))) {
  console.log("· build: skipped (no .next/server — run after `npm run build`)");
} else {
  const { problems, listsSeen } = checkBuild();

  if (listsSeen === 0) {
    // A guard that silently stops guarding is worse than no guard: if the
    // bundler's output shape changes, fail loudly and re-derive it (see
    // the header — the shape was found by building the bug on purpose).
    failed = true;
    console.error(
      "\n✗ build: found no ensureServerEntryExports(...) lists to inspect." +
        "\n  The bundler's output shape has changed, so this check is now blind." +
        "\n  Re-derive the fingerprint and update scripts/check-server-actions.ts.\n",
    );
  } else if (problems.length > 0) {
    failed = true;
    console.error("\n✗ Phantom export in a compiled server-action chunk\n");
    for (const problem of problems) {
      console.error(`  ${problem.file}`);
      console.error(`    ${problem.detail}`);
    }
    console.error("\n  Every action in that chunk will throw at module load.\n");
  } else {
    console.log(`✓ build: ${listsSeen} action export lists clean`);
  }
}

process.exit(failed ? 1 : 0);
