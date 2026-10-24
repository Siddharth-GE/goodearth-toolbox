/**
 * Whether a new Masters record is one already there under another spelling: the same GSTIN, phone
 * or code, or a near name ("K Santhosh" for "Santhosh K", "Geo Bricks" for "GeoBricks", "Madhu M A"
 * for "Madhu"). Only a warning: the admin decides. Pure.
 */

export type Known = {
  name: string;
  tax?: string | null;
  phone?: string | null;
  code?: string | null;
};

/** Words that say what kind of firm, not which one. */
const FILLER = new Set(["pvt", "private", "ltd", "limited", "llp", "co", "the", "ms"]);

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A name's words, sorted, with initials and filler dropped: the order and the initials vary by who typed it. */
function words(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !FILLER.has(word))
    .sort()
    .join(" ");
}

const digits = (phone: string) => phone.replace(/\D/g, "").slice(-10);

/** One edit apart: a typo, not a different name. */
function oneApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Why `row` looks like `known`, or nothing. */
export function likeness(row: Known, known: Known): string | undefined {
  const tax = (value?: string | null) => (value ?? "").toUpperCase().replace(/\s+/g, "");
  if (tax(row.tax) && tax(row.tax) === tax(known.tax)) return "the same GSTIN";
  if (row.phone && known.phone && digits(row.phone).length === 10) {
    if (digits(row.phone) === digits(known.phone)) return "the same phone";
  }
  if (row.code && known.code && squash(row.code) === squash(known.code)) return "the same code";
  const a = squash(row.name);
  const b = squash(known.name);
  if (!a || !b) return undefined;
  if (a === b || (words(row.name) && words(row.name) === words(known.name))) return "a near name";
  if (a.length >= 6 && oneApart(a, b)) return "a near name";
  return undefined;
}

/** Each row's warning, or null: first against what exists, then against the rows before it. */
export function lookAlikes(rows: Known[], existing: Known[]): (string | null)[] {
  return rows.map((row, index) => {
    for (const known of existing) {
      const why = likeness(row, known);
      if (why) return `Looks like ${known.name} (${why})`;
    }
    for (let at = 0; at < index; at += 1) {
      const why = likeness(row, rows[at]);
      if (why) return `Same as row ${at + 1} (${why})`;
    }
    return null;
  });
}
