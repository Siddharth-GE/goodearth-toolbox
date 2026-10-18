/**
 * Fails when a Supabase result's `error` is never read (CLAUDE.md: always
 * check `error`, not just `data`). A deliberate exception carries a
 * `// error ignored: <why>` comment on the line above.
 *
 *   npx tsx scripts/check-errors.ts [paths…]      # default: app lib components
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const IGNORE_MARK = "error ignored:";
const NOT_SUPABASE_ROOTS = new Set([
  "Array",
  "Buffer",
  "Object",
  "Promise",
  "JSON",
  "Math",
  "Date",
]);

function files(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p)) if (entry !== "node_modules") walk(join(p, entry));
    } else if (
      /\.(ts|tsx)$/.test(p) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith("database.types.ts")
    ) {
      out.push(p);
    }
  };
  for (const p of paths) walk(p);
  return out;
}

function rootName(node: ts.Expression): string | undefined {
  let current: ts.Node = node;
  for (;;) {
    if (ts.isCallExpression(current)) current = current.expression;
    else if (ts.isPropertyAccessExpression(current)) current = current.expression;
    else if (ts.isElementAccessExpression(current)) current = current.expression;
    else if (ts.isParenthesizedExpression(current)) current = current.expression;
    else if (ts.isNonNullExpression(current)) current = current.expression;
    else break;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

/** A call chain that reaches the database: `.from(`, `.rpc(` or `.storage`. */
function isSupabaseChain(
  expr: ts.Expression,
  source: ts.SourceFile,
  builders: Set<string>,
): boolean {
  if (ts.isIdentifier(expr)) return builders.has(expr.text);
  if (!ts.isCallExpression(expr) && !ts.isPropertyAccessExpression(expr)) return false;
  // withRetry hands back the raw { data, error }.
  if (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === "withRetry"
  ) {
    return true;
  }
  const root = rootName(expr);
  if (!root || NOT_SUPABASE_ROOTS.has(root)) return false;
  if (builders.has(root)) return true;
  // Only the chain's own links count, so `fetchAll(() => supabase.from(…))`,
  // which throws on failure, is not mistaken for a raw result.
  const links: string[] = [];
  let current: ts.Expression = expr;
  for (;;) {
    if (ts.isCallExpression(current)) current = current.expression;
    else if (ts.isPropertyAccessExpression(current)) {
      links.push(current.name.text);
      current = current.expression;
    } else break;
  }
  void source;
  if (links.includes("then")) return false;
  return links.some((name) => name === "from" || name === "rpc" || name === "storage");
}

function awaited(expr: ts.Expression | undefined): ts.Expression | undefined {
  if (!expr) return undefined;
  while (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isNonNullExpression(expr)
  ) {
    expr = expr.expression;
  }
  return ts.isAwaitExpression(expr) ? expr.expression : undefined;
}

function enclosingScope(node: ts.Node): ts.Node {
  let current = node.parent;
  while (current && !ts.isFunctionLike(current) && !ts.isSourceFile(current))
    current = current.parent;
  return current ?? node.getSourceFile();
}

/** Is `name` used anywhere in `scope` other than at `declared`? */
function isRead(name: string, scope: ts.Node, declared: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(node) && node.text === name && node !== declared) {
      const parent = node.parent;
      const isKeyOfAccess = ts.isPropertyAccessExpression(parent) && parent.name === node;
      const isBindingKey = ts.isBindingElement(parent) && parent.propertyName === node;
      if (!isKeyOfAccess && !isBindingKey) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

/** For a whole-result binding: is `.error` read, or the result handed on whole? */
function resultHandled(name: string, scope: ts.Node, declared: ts.Node): boolean {
  let found = false;
  const visit = (node: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(node) && node.text === name && node !== declared) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
        if (parent.name.text === "error") found = true;
      } else if (!(ts.isPropertyAccessExpression(parent) && parent.name === node)) {
        // Passed, returned, spread or destructured whole: someone else reads it.
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

function check(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, kind);
  const lines = text.split("\n");
  const problems: string[] = [];

  // Query builders kept in a variable before being awaited.
  const builders = new Set<string>();
  const findBuilders = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !ts.isAwaitExpression(node.initializer) &&
      /\.(from|rpc)\(/.test(node.initializer.getText(source))
    ) {
      builders.add(node.name.text);
    }
    ts.forEachChild(node, findBuilders);
  };
  findBuilders(source);

  const report = (node: ts.Node, message: string) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
    if ((lines[line - 1] ?? "").includes(IGNORE_MARK) || (lines[line] ?? "").includes(IGNORE_MARK))
      return;
    problems.push(`${file}:${line + 1}: ${message}`);
  };

  const checkBinding = (binding: ts.BindingName, call: ts.Expression, at: ts.Node) => {
    const scope = enclosingScope(at);
    if (ts.isObjectBindingPattern(binding)) {
      const errorElement = binding.elements.find(
        (element) =>
          (element.propertyName &&
            ts.isIdentifier(element.propertyName) &&
            element.propertyName.text === "error") ||
          (!element.propertyName && ts.isIdentifier(element.name) && element.name.text === "error"),
      );
      const rest = binding.elements.find((element) => element.dotDotDotToken);
      if (!errorElement) {
        if (!rest)
          report(
            at,
            `\`error\` is never taken from ${call.getText(source).split("\n")[0].slice(0, 60)}`,
          );
        return;
      }
      if (
        ts.isIdentifier(errorElement.name) &&
        !isRead(errorElement.name.text, scope, errorElement.name)
      ) {
        report(at, `\`${errorElement.name.text}\` is taken but never read`);
      }
    } else if (ts.isIdentifier(binding)) {
      if (!resultHandled(binding.text, scope, binding))
        report(at, `\`${binding.text}.error\` is never read`);
    }
  };

  const visit = (node: ts.Node) => {
    // const { data, error } = await supabase…   /   const result = await supabase…
    if (ts.isVariableDeclaration(node)) {
      const call = awaited(node.initializer);
      if (call && isSupabaseChain(call, source, builders)) checkBinding(node.name, call, node);
      // const [a, b] = await Promise.all([supabase…, supabase…])
      if (
        call &&
        ts.isArrayBindingPattern(node.name) &&
        ts.isCallExpression(call) &&
        call.expression.getText(source) === "Promise.all" &&
        call.arguments[0] &&
        ts.isArrayLiteralExpression(call.arguments[0])
      ) {
        call.arguments[0].elements.forEach((element, index) => {
          const binding = (node.name as ts.ArrayBindingPattern).elements[index];
          if (!binding || ts.isOmittedExpression(binding)) return;
          if (isSupabaseChain(element, source, builders)) checkBinding(binding.name, element, node);
        });
      }
    }
    // await supabase…insert(…);  — the answer thrown away
    if (ts.isExpressionStatement(node)) {
      const call = awaited(node.expression);
      if (call && isSupabaseChain(call, source, builders))
        report(node, "the result is thrown away");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  const problems = files(args.length ? args : ["app", "lib", "components"]).flatMap(check);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`\n${problems.length} Supabase result(s) whose error is never read.`);
    process.exitCode = 1;
    return;
  }
  console.log("Every Supabase result's error is read.");
}

main();
