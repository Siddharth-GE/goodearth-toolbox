/** The Mixes list's search, filters and grouping, pure. Mixes are a short list, so it all runs over every row on the server. */

export type MixListRow = {
  name: string;
  uom: string;
  description: string | null;
  groupName: string | null;
  isActive: boolean;
  componentCount: number;
  useCount: number;
  materialNames: string[];
};

export const NO_GROUP = "(none)";

export type MixListParams = {
  q?: string;
  /** A group's name, any case, or NO_GROUP. */
  group?: string;
  status?: "active" | "inactive";
  show?: "empty" | "unused";
  by?: "unit" | "none";
};

/** URL params made safe: anything not on the lists is dropped. */
export function mixListParams(raw: Record<string, string | undefined>): MixListParams {
  const q = raw.q?.trim().slice(0, 80);
  const group = raw.group?.trim().slice(0, 80);
  return {
    q: q || undefined,
    group: group || undefined,
    status: raw.status === "active" || raw.status === "inactive" ? raw.status : undefined,
    show: raw.show === "empty" || raw.show === "unused" ? raw.show : undefined,
    by: raw.by === "unit" || raw.by === "none" ? raw.by : undefined,
  };
}

/** Groups match whatever their case or spacing, so "concrete " and "Concrete" are one group. */
export function groupKey(name: string | null): string {
  return name?.trim().toLowerCase() || NO_GROUP;
}

/** Every group in use, each under its first spelling, A–Z. */
export function mixGroupNames(rows: { groupName: string | null }[]): string[] {
  const names = new Map<string, string>();
  for (const row of rows) {
    const key = groupKey(row.groupName);
    if (key !== NO_GROUP && !names.has(key)) names.set(key, row.groupName!.trim());
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

export function filterMixes<T extends MixListRow>(rows: T[], params: MixListParams): T[] {
  const words = (params.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const group = params.group ? groupKey(params.group) : undefined;

  return rows.filter((row) => {
    if (group && groupKey(row.groupName) !== group) return false;
    if (params.status === "active" && !row.isActive) return false;
    if (params.status === "inactive" && row.isActive) return false;
    if (params.show === "empty" && row.componentCount > 0) return false;
    if (params.show === "unused" && row.useCount > 0) return false;
    if (words.length === 0) return true;
    const haystack = [
      row.name,
      row.uom,
      row.description ?? "",
      row.groupName ?? "",
      ...row.materialNames,
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Headed sections in the order shown: by group (the default) or unit A–Z with "No group" last, or one unheaded list. */
export function groupMixes<T extends MixListRow>(
  rows: T[],
  by: MixListParams["by"],
): { heading: string | null; rows: T[] }[] {
  if (by === "none") return rows.length === 0 ? [] : [{ heading: null, rows }];

  const sections = new Map<string, { heading: string; rows: T[] }>();
  for (const row of rows) {
    const key = by === "unit" ? `unit:${row.uom.toLowerCase()}` : groupKey(row.groupName);
    const heading = by === "unit" ? row.uom : key === NO_GROUP ? "No group" : row.groupName!.trim();
    const section = sections.get(key) ?? { heading, rows: [] };
    section.rows.push(row);
    sections.set(key, section);
  }
  return [...sections.entries()]
    .sort(([a, x], [b, y]) =>
      a === NO_GROUP ? 1 : b === NO_GROUP ? -1 : x.heading.localeCompare(y.heading),
    )
    .map(([, section]) => section);
}
