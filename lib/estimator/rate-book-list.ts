/** The rate book's search and filters, pure. The book is a few hundred works, so it all runs over every row on the server. */

export type RateBookListRow = {
  code: string;
  name: string;
  groupName: string | null;
  category: string;
  categoryCode: string;
  uom: string | null;
  componentCount: number;
  rate: number | null;
  lineCount: number;
  /** The materials and mixes in the work's recipe, so "cement" finds every work using it. */
  componentNames: string[];
};

export const RATE_BOOK_SHOWS = {
  todo: "Used but not priced",
  unset: "Not set up",
  unpriced: "Set up, not priced",
  labour: "Labour only",
  priced: "Priced",
} as const;

export type RateBookShow = keyof typeof RATE_BOOK_SHOWS;

export type RateBookParams = { q?: string; category?: string; show?: RateBookShow };

export function rateBookParams(raw: Record<string, string | undefined>): RateBookParams {
  const q = raw.q?.trim().slice(0, 80);
  const category = raw.category?.trim().slice(0, 40);
  return {
    q: q || undefined,
    category: category || undefined,
    show: raw.show && raw.show in RATE_BOOK_SHOWS ? (raw.show as RateBookShow) : undefined,
  };
}

function shows(row: RateBookListRow, show: RateBookShow): boolean {
  switch (show) {
    case "todo":
      return row.lineCount > 0 && row.rate === null;
    case "unset":
      return row.uom === null;
    case "unpriced":
      return row.uom !== null && row.rate === null;
    case "labour":
      return row.uom !== null && row.componentCount === 0;
    case "priced":
      return row.rate !== null;
  }
}

export function filterRateBook<T extends RateBookListRow>(rows: T[], params: RateBookParams): T[] {
  const words = (params.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    if (params.category && row.categoryCode !== params.category) return false;
    if (params.show && !shows(row, params.show)) return false;
    if (words.length === 0) return true;
    const haystack = [row.code, row.name, row.groupName ?? "", row.category, ...row.componentNames]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
