/**
 * Pure logic for a deck's saved answers: the reserved file names the
 * viewer serves beside a deck, the shape and limits of what the browser
 * may send, and how a saved answer reads on the staff screen.
 *
 * Deliberately import-free — this is read by `lib/dexter/actions.ts`
 * ("use server", where the whole module must stay lean) AND by
 * `app/deck/[token]/[[...path]]/route.ts` (a public route with no
 * session), so it cannot depend on either's machinery. Every exported
 * name here is part of that shared contract — do not rename one without
 * updating the route.
 */

// ---------------------------------------------------------------------
// Reserved names and limits
// ---------------------------------------------------------------------

// Both begin with a dot, so `planZip` can never put a file of either name
// inside a deck — the viewer is free to answer them itself.
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

// ---------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One answer's value is a short string, a boolean, or a short list of short strings. */
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

/** JSON text from the browser → a clean payload, or one plain-English error. */
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

/** jsonb from the database → the same shape, dropping anything that isn't (a row written before a rule changed). */
export function readAnswerFields(value: unknown): AnswerFields {
  if (!isPlainObject(value)) return {};
  const fields: AnswerFields = {};
  for (const [name, item] of Object.entries(value)) {
    if (isAnswerName(name) && isAnswerValue(item)) fields[name] = item;
  }
  return fields;
}

// ---------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------

/** For the staff dialog: true → "Yes", false → "No", a list → "a, b", a string as is. */
export function formatAnswer(value: AnswerValue): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  return value === "" ? "—" : value;
}
