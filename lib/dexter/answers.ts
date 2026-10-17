// Import-free on purpose: read by actions.ts ("use server") and by the public deck route, which has
// no session. Renaming an export breaks the route. The browser is untrusted, so what it may send is
// capped and validated here.

// Both start with a dot, so planZip can never put a file of either name inside a deck.
export const DEXTER_SCRIPT_PATH = ".dexter.js";
export const DEXTER_STATE_PATH = ".state";

export type AnswerValue = string | boolean | string[];
export type AnswerFields = Record<string, AnswerValue>;

export const ANSWER_LIMITS = {
  bytes: 64 * 1024,
  fields: 200,
  nameLength: 120,
  textLength: 10_000,
  listItems: 50,
  listItemLength: 500,
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnswerValue(value: unknown): value is AnswerValue {
  if (typeof value === "string") return value.length <= ANSWER_LIMITS.textLength;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return (
      value.length <= ANSWER_LIMITS.listItems &&
      value.every((item) => typeof item === "string" && item.length <= ANSWER_LIMITS.listItemLength)
    );
  }
  return false;
}

function isAnswerName(name: string): boolean {
  return name.trim() !== "" && name.length <= ANSWER_LIMITS.nameLength;
}

export function parseAnswers(
  text: string,
): { fields: AnswerFields; submitted: boolean } | { error: string } {
  if (text.length > ANSWER_LIMITS.bytes) return { error: "Those answers are too large to save." };

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "The answers weren't valid JSON." };
  }

  if (!isPlainObject(body) || !isPlainObject(body.fields)) {
    return { error: "The answers need a 'fields' object." };
  }
  if (body.submitted !== undefined && typeof body.submitted !== "boolean") {
    return { error: "'submitted' must be true or false." };
  }

  const entries = Object.entries(body.fields);
  if (entries.length > ANSWER_LIMITS.fields) {
    return { error: `There are too many fields — the limit is ${ANSWER_LIMITS.fields}.` };
  }

  const fields: AnswerFields = {};
  for (const [name, value] of entries) {
    if (!isAnswerName(name)) {
      return {
        error: `Field names must be 1 to ${ANSWER_LIMITS.nameLength} characters.`,
      };
    }
    if (!isAnswerValue(value)) {
      return { error: `The answer for "${name}" isn't text, a tick, or a list of text.` };
    }
    fields[name] = value;
  }

  return { fields, submitted: body.submitted === true };
}

// Drops anything off-shape (a row written before a rule changed).
export function readAnswerFields(value: unknown): AnswerFields {
  if (!isPlainObject(value)) return {};
  const fields: AnswerFields = {};
  for (const [name, item] of Object.entries(value)) {
    if (isAnswerName(name) && isAnswerValue(item)) fields[name] = item;
  }
  return fields;
}

export function formatAnswer(value: AnswerValue): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return value === "" ? "—" : value;
}
