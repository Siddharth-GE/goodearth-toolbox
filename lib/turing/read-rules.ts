/**
 * What a read from Turing may ask for, checked before it reaches the database. Pure: the
 * names come from the generated schema, so a read can only name a real table, view or
 * column, and never an embed (BUGCATCHER #2). Row-level security still decides what comes back.
 */
import type { Schema } from "./schema";

export const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "ilike", "is"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type Read = {
  table: string;
  columns: string[];
  filters: { column: string; op: FilterOp; value: string }[];
  order: { column: string; ascending: boolean }[];
  limit: number;
  countOnly: boolean;
};

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** A direct read stays small enough to sit in the conversation; code and pages may read more. */
export const DIRECT_LIMIT = 500;
export const BULK_LIMIT = 5000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type Scalar = string | number | boolean;
const isScalar = (value: unknown): value is Scalar =>
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));

/** One value inside PostgREST's `in.(…)`, double-quoted so commas and brackets stay literal. */
function inItem(value: Scalar): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function filterValue(op: FilterOp, value: unknown): Checked<string> {
  if (op === "is") {
    if (value === null || value === true || value === false) {
      return { ok: true, value: String(value) };
    }
    return { ok: false, error: '"is" takes null, true or false.' };
  }
  if (op === "in") {
    if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
      return { ok: false, error: '"in" takes a list of 1 to 200 values.' };
    }
    if (!value.every(isScalar)) return { ok: false, error: '"in" values must be plain values.' };
    return { ok: true, value: `(${value.map(inItem).join(",")})` };
  }
  if (!isScalar(value)) return { ok: false, error: `"${op}" takes one plain value.` };
  return { ok: true, value: String(value) };
}

/** Checks one read's arguments; `maxLimit` is DIRECT_LIMIT or BULK_LIMIT by who is asking. */
export function checkRead(input: unknown, schema: Schema, maxLimit: number): Checked<Read> {
  if (!isObject(input)) return { ok: false, error: "A read is an object." };
  const table = input.table;
  if (typeof table !== "string" || !Object.hasOwn(schema, table)) {
    return { ok: false, error: `There is no table or view called "${String(table)}".` };
  }
  const known = schema[table].columns;
  const isColumn = (name: unknown): name is string =>
    typeof name === "string" && Object.hasOwn(known, name);

  let columns = Object.keys(known);
  if (input.columns !== undefined) {
    if (!Array.isArray(input.columns) || input.columns.length === 0) {
      return { ok: false, error: "columns is a list of column names." };
    }
    const unknown = input.columns.find((name) => !isColumn(name));
    if (unknown !== undefined) {
      return { ok: false, error: `${table} has no column "${String(unknown)}".` };
    }
    columns = [...new Set(input.columns as string[])];
  }

  const filters: Read["filters"] = [];
  if (input.filters !== undefined) {
    if (!Array.isArray(input.filters) || input.filters.length > 20) {
      return { ok: false, error: "filters is a list of at most 20." };
    }
    for (const filter of input.filters) {
      if (!isObject(filter)) return { ok: false, error: "Each filter is an object." };
      if (!isColumn(filter.column)) {
        return { ok: false, error: `${table} has no column "${String(filter.column)}".` };
      }
      if (!FILTER_OPS.includes(filter.op as FilterOp)) {
        return { ok: false, error: `Filters use one of: ${FILTER_OPS.join(", ")}.` };
      }
      const value = filterValue(filter.op as FilterOp, filter.value);
      if (!value.ok) return value;
      filters.push({ column: filter.column, op: filter.op as FilterOp, value: value.value });
    }
  }

  const order: Read["order"] = [];
  if (input.order !== undefined) {
    if (!Array.isArray(input.order) || input.order.length > 5) {
      return { ok: false, error: "order is a list of at most 5." };
    }
    for (const step of input.order) {
      if (!isObject(step) || !isColumn(step.column)) {
        return { ok: false, error: `Order by a column of ${table}.` };
      }
      order.push({ column: step.column, ascending: step.ascending !== false });
    }
  }

  let limit = Math.min(100, maxLimit);
  if (input.limit !== undefined) {
    if (typeof input.limit !== "number" || !Number.isInteger(input.limit) || input.limit < 1) {
      return { ok: false, error: "limit is a whole number of at least 1." };
    }
    if (input.limit > maxLimit) {
      return { ok: false, error: `At most ${maxLimit} rows at a time here.` };
    }
    limit = input.limit;
  }

  return {
    ok: true,
    value: { table, columns, filters, order, limit, countOnly: input.count_only === true },
  };
}

export type RecipeRead = Read & { name: string };

/** A page's reads: named, at most eight, each checked like a bulk read. */
export function checkRecipe(input: unknown, schema: Schema): Checked<RecipeRead[]> {
  if (!Array.isArray(input) || input.length === 0 || input.length > 8) {
    return { ok: false, error: "A page needs 1 to 8 reads." };
  }
  const reads: RecipeRead[] = [];
  const names = new Set<string>();
  for (const entry of input) {
    if (
      !isObject(entry) ||
      typeof entry.name !== "string" ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(entry.name)
    ) {
      return { ok: false, error: "Each read has a name in lower_case_with_underscores." };
    }
    if (names.has(entry.name)) return { ok: false, error: `Two reads are called "${entry.name}".` };
    names.add(entry.name);
    const read = checkRead(entry, schema, BULK_LIMIT);
    if (!read.ok) return { ok: false, error: `${entry.name}: ${read.error}` };
    reads.push({ ...read.value, name: entry.name });
  }
  return { ok: true, value: reads };
}
