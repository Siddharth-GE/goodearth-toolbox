/**
 * Whether a new Masters record is one already there under another spelling: the same GSTIN, phone
 * or code, or a near name ("K Santhosh" for "Santhosh K", "Geo Bricks Pvt Ltd" for "GeoBricks",
 * "Madhu M A" for "Madhu"). Names whose numbers differ are never near: "PVC pipe 20mm" is not
 * "PVC pipe 25mm". Only a warning: the admin decides. Pure.
 */

export type Known = {
  name: string;
  tax?: string | null;
  phone?: string | null;
  code?: string | null;
};

/** Words that say what kind of firm, not which one. */
const FILLER = new Set(["pvt", "private", "ltd", "limited", "llp", "co", "the", "ms"]);

/** A record made ready to compare, once. */
type Keys = {
  name: string;
  tax: string;
  phones: string[];
  code: string;
  /** The name's letters and digits run together, filler dropped: "geobricks". */
  plain: string;
  /** Its words sorted, initials and filler dropped: the order and the initials vary by who typed it. */
  words: string;
  /** Every number in the name, in order. */
  numbers: string;
};

function keysOf(known: Known): Keys {
  const tokens = known.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token && !FILLER.has(token));
  return {
    name: known.name,
    tax: (known.tax ?? "").toUpperCase().replace(/\s+/g, ""),
    // A field may hold two numbers; each is matched on its last ten digits.
    phones: (known.phone ?? "")
      .split(/[,;/]/)
      .map((phone) => phone.replace(/\D/g, "").slice(-10))
      .filter((phone) => phone.length === 10),
    // Dots stay: CAR.1.11 is not CAR.11.1.
    code: (known.code ?? "").toUpperCase().replace(/\s+/g, ""),
    plain: tokens.join(""),
    words: tokens
      .filter((token) => token.length > 1 || /\d/.test(token))
      .sort()
      .join(" "),
    numbers: (known.name.match(/\d+/g) ?? []).join(" "),
  };
}

/** One edit apart: a typo, not a different name. */
function oneApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function why(row: Keys, known: Keys): string | undefined {
  if (row.tax && row.tax === known.tax) return "the same GSTIN";
  if (row.phones.some((phone) => known.phones.includes(phone))) return "the same phone";
  if (row.code && row.code === known.code) return "the same code";
  if (!row.plain || !known.plain || row.numbers !== known.numbers) return undefined;
  if (row.plain === known.plain || (row.words && row.words === known.words)) return "a near name";
  if (row.plain.length >= 6 && oneApart(row.plain, known.plain)) return "a near name";
  return undefined;
}

/** Why `row` looks like `known`, or nothing. */
export const likeness = (row: Known, known: Known) => why(keysOf(row), keysOf(known));

/** Each row's warning, or null: first against what exists, then against the rows before it. */
export function lookAlikes(rows: Known[], existing: Known[]): (string | null)[] {
  const known = existing.map(keysOf);
  const mine = rows.map(keysOf);
  return mine.map((row, index) => {
    for (const other of known) {
      const reason = why(row, other);
      if (reason) return `Looks like ${other.name} (${reason})`;
    }
    for (let at = 0; at < index; at += 1) {
      const reason = why(row, mine[at]);
      if (reason) return `Same as row ${at + 1} (${reason})`;
    }
    return null;
  });
}
