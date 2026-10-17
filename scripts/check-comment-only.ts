/**
 * Proves a change touched comments and layout only: every changed .ts/.tsx
 * file compiles to the same tokens before and after, comments stripped.
 * Exit 1 names each file whose code changed.
 *
 *   npx tsx scripts/check-comment-only.ts            # working tree vs HEAD
 *   npx tsx scripts/check-comment-only.ts <ref>      # working tree vs <ref>
 *   npx tsx scripts/check-comment-only.ts <a> <b>    # commit <b> vs <a>
 *   … -- lib/bills "app/(dashboard)/bills"           # only these paths
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/** Compiled with comments stripped and JSX turned into calls, so JSX text
 * re-wrapped by prettier compiles the same. */
function compile(source: string, fileName: string) {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      removeComments: true,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      verbatimModuleSyntax: false,
    },
  }).outputText;
}

/** The TypeScript itself, comments and whitespace removed: compiling erases
 * types, so a deleted type member shows only here. */
function typeShape(source: string, fileName: string) {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, false, kind);
  return ts.createPrinter({ removeComments: true }).printFile(file).replace(/\s+/g, "");
}

/** The compiled code as tokens, whitespace and comments ignored. */
function tokens(code: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.ESNext, true, ts.LanguageVariant.Standard, code);
  const out: string[] = [];
  const braces: ("brace" | "template")[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind === ts.SyntaxKind.TemplateHead) braces.push("template");
    else if (kind === ts.SyntaxKind.OpenBraceToken) braces.push("brace");
    else if (kind === ts.SyntaxKind.CloseBraceToken) {
      if (braces.pop() === "template") {
        kind = scanner.reScanTemplateToken(false);
        if (kind === ts.SyntaxKind.TemplateMiddle) braces.push("template");
      }
    }
    out.push(`${kind}:${scanner.getTokenText()}`);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const split = argv.indexOf("--");
  const [a, b] = split === -1 ? argv : argv.slice(0, split);
  const paths = split === -1 ? [] : ["--", ...argv.slice(split + 1)];
  const base = a ?? "HEAD";
  const changed = (
    b ? git("diff", "--name-status", a, b, ...paths) : git("diff", "--name-status", base, ...paths)
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));

  const failures: string[] = [];
  let checked = 0;
  for (const [status, file] of changed) {
    if (!/\.(ts|tsx|mts|js|mjs)$/.test(file)) continue;
    if (status !== "M") {
      failures.push(
        `${file}: ${status === "D" ? "deleted" : "added or renamed"}, not a comment edit`,
      );
      continue;
    }
    const before = git("show", `${base}:${file}`);
    const after = b
      ? git("show", `${b}:${file}`)
      : existsSync(file)
        ? readFileSync(file, "utf8")
        : "";
    const x = tokens(compile(before, file));
    const y = tokens(compile(after, file));
    checked++;
    const at = x.findIndex((token, i) => token !== y[i]);
    if (at !== -1 || x.length !== y.length) {
      const i = at === -1 ? Math.min(x.length, y.length) : at;
      failures.push(
        `${file}: code changed near "${x[i]?.split(":").slice(1).join(":")}" → "${y[i]?.split(":").slice(1).join(":")}"`,
      );
    } else if (typeShape(before, file) !== typeShape(after, file)) {
      failures.push(`${file}: a type changed (compiled code is the same)`);
    }
  }

  if (failures.length > 0) {
    console.error(`NOT comment-only — ${failures.length} file(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Comment-only: ${checked} file(s) compile to the same code.`);
}

main();
