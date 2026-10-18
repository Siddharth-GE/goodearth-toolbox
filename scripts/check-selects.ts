/**
 * Checks every literal `.from("t").select("…")` against the generated types
 * (lib/supabase/database.types.ts): each column exists, each embed is a real
 * relationship, and an embed with two keys to the same table names its key.
 * A typo here type-checks and builds, then fails on the screen (BUGCATCHER #2).
 *
 *   npx tsx scripts/check-selects.ts [paths…]      # default: app lib
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type Relationship = { name: string; columns: string[]; from: string; to: string };
type Schema = { columns: Map<string, Set<string>>; relationships: Relationship[] };

/** Reads Tables and Views (Row keys and Relationships) from the generated types. */
function readSchema(): Schema {
  const path = "lib/supabase/database.types.ts";
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
  const columns = new Map<string, Set<string>>();
  const relationships: Relationship[] = [];

  const literalText = (node: ts.Node) =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined;
  const member = (type: ts.TypeLiteralNode, name: string) =>
    type.members.find(
      (m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === name,
    );

  const readGroup = (group: ts.TypeLiteralNode) => {
    for (const relation of group.members) {
      if (
        !ts.isPropertySignature(relation) ||
        !relation.type ||
        !ts.isTypeLiteralNode(relation.type)
      )
        continue;
      const name = ts.isIdentifier(relation.name)
        ? relation.name.text
        : (literalText(relation.name) ?? "");
      const row = member(relation.type, "Row")?.type;
      if (row && ts.isTypeLiteralNode(row)) {
        columns.set(
          name,
          new Set(
            row.members.flatMap((m) =>
              ts.isPropertySignature(m)
                ? [ts.isIdentifier(m.name) ? m.name.text : (literalText(m.name) ?? "")]
                : [],
            ),
          ),
        );
      }
      const rels = member(relation.type, "Relationships")?.type;
      if (rels && ts.isTupleTypeNode(rels)) {
        for (const element of rels.elements) {
          if (!ts.isTypeLiteralNode(element)) continue;
          const field = (key: string) => member(element, key)?.type;
          const fk = field("foreignKeyName");
          const to = field("referencedRelation");
          const cols = field("columns");
          if (!fk || !to || !cols || !ts.isLiteralTypeNode(fk) || !ts.isLiteralTypeNode(to))
            continue;
          relationships.push({
            name: literalText(fk.literal) ?? "",
            from: name,
            to: literalText(to.literal) ?? "",
            columns: ts.isTupleTypeNode(cols)
              ? cols.elements.flatMap((c) =>
                  ts.isLiteralTypeNode(c) ? [literalText(c.literal) ?? ""] : [],
                )
              : [],
          });
        }
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isPropertySignature(node) &&
      ts.isIdentifier(node.name) &&
      (node.name.text === "Tables" || node.name.text === "Views") &&
      node.type &&
      ts.isTypeLiteralNode(node.type)
    ) {
      readGroup(node.type);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { columns, relationships };
}

type Item =
  | { kind: "column"; name: string }
  | { kind: "embed"; name: string; hints: string[]; children: Item[] };

/** Splits a select string at top-level commas and parses each item. */
function parseSelect(text: string): Item[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);

  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((part): Item => {
      const open = part.indexOf("(");
      if (open !== -1 && part.endsWith(")")) {
        const head = part.slice(0, open).replace(/^\.\.\./, "");
        const target = head.includes(":") ? head.slice(head.indexOf(":") + 1) : head;
        const [name, ...hints] = target.split("!").map((s) => s.trim());
        return { kind: "embed", name, hints, children: parseSelect(part.slice(open + 1, -1)) };
      }
      // alias:column, column::cast, column->json path
      let name =
        part.includes(":") && !part.includes("::") ? part.slice(part.indexOf(":") + 1) : part;
      if (part.includes(":") && part.indexOf(":") < part.indexOf("::"))
        name = part.slice(part.indexOf(":") + 1);
      name = name.split("::")[0].split("->")[0].trim();
      return { kind: "column", name };
    });
}

const JOIN_MODIFIERS = new Set(["inner", "left"]);

function checkItems(schema: Schema, table: string, items: Item[], problems: string[]) {
  const columns = schema.columns.get(table);
  if (!columns) {
    problems.push(`"${table}" is not a table or view`);
    return;
  }
  for (const item of items) {
    if (item.kind === "column") {
      if (item.name === "*" || item.name === "count") continue;
      if (!columns.has(item.name)) problems.push(`"${table}" has no column "${item.name}"`);
      continue;
    }
    const hints = item.hints.filter((hint) => !JOIN_MODIFIERS.has(hint));
    // Embedding by a foreign-key column (created_by(…)) names the table it points at.
    const byColumn = schema.relationships.find(
      (r) => r.from === table && r.columns.length === 1 && r.columns[0] === item.name,
    );
    const target = schema.columns.has(item.name) ? item.name : byColumn?.to;
    if (!target) {
      problems.push(`"${table}" embeds "${item.name}", which is no table or key`);
      continue;
    }
    const candidates = schema.relationships.filter(
      (r) => (r.from === table && r.to === target) || (r.from === target && r.to === table),
    );
    const keys = new Set(candidates.map((r) => r.name));
    if (keys.size === 0) {
      problems.push(`"${table}" has no relationship to "${target}"`);
    } else if (hints.length === 0 && !byColumn && keys.size > 1) {
      problems.push(
        `"${table}" → "${target}" is ambiguous (${[...keys].join(", ")}): name the key with !`,
      );
    } else if (hints.length > 0) {
      const hint = hints[0];
      const matches = candidates.some((r) => r.name === hint || r.columns.includes(hint));
      if (!matches)
        problems.push(`"${table}" → "${target}" names "${hint}", which is not one of its keys`);
    }
    checkItems(schema, target, item.children, problems);
  }
}

function files(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const entry of readdirSync(p)) if (entry !== "node_modules") walk(join(p, entry));
    } else if (/\.(ts|tsx)$/.test(p) && !p.endsWith("database.types.ts")) out.push(p);
  };
  for (const p of paths) walk(p);
  return out;
}

function stringValue(node: ts.Expression, consts: Map<string, string>): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return consts.get(node.text);
  return undefined;
}

function main() {
  const schema = readSchema();
  const args = process.argv.slice(2);
  const problems: string[] = [];
  let checked = 0;

  for (const file of files(args.length ? args : ["app", "lib"])) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(".select(")) continue;
    const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, kind);

    // const X_SELECT = `…` kept apart from the call.
    const consts = new Map<string, string>();
    const collect = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const value = stringValue(node.initializer, new Map());
        if (value !== undefined) consts.set(node.name.text, value);
      }
      ts.forEachChild(node, collect);
    };
    collect(source);

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "select" &&
        node.arguments[0]
      ) {
        const selected = stringValue(node.arguments[0], consts);
        // Walk back down the chain to its .from("table").
        let link: ts.Expression = node.expression.expression;
        let table: string | undefined;
        while (ts.isCallExpression(link) && ts.isPropertyAccessExpression(link.expression)) {
          if (link.expression.name.text === "from" && link.arguments[0]) {
            table = stringValue(link.arguments[0], consts);
            break;
          }
          link = link.expression.expression;
        }
        if (selected !== undefined && table && !table.includes("/")) {
          checked++;
          const found: string[] = [];
          checkItems(schema, table, parseSelect(selected), found);
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          for (const problem of found)
            problems.push(`${file.split("\\").join("/")}:${line}: ${problem}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(`\n${problems.length} problem(s) in ${checked} select strings.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${checked} select strings match the database types.`);
}

main();
