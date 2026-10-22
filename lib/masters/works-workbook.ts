// Pure half of the works import (scripts/import-masters-workbook.ts): the estate's works sheets read by their shape,
// and today's works matched to the new rows. A matched work keeps its id; nothing is deleted, only switched off.
import { type Cell, type SheetRow, looseKey } from "./masters-workbook";
import { WORK_FAMILIES, type WorkFamily } from "./work-families";

export const FAMILIES = WORK_FAMILIES;
export type Family = WorkFamily;

export type EstateCategory = { code: string; name: string; family: Family; sort_order: number };
export type EstateGroup = { code: string; category: string; name: string; sort_order: number };
export type EstateWork = {
  code: string;
  category: string;
  group: string | null;
  name: string;
  sort_order: number;
  uom: string | null;
  labour_rate: number | null;
  /** A share of its stage's rate per sqft: the work an estimate measures for that stage (founder, 2026-10-22). */
  is_package: boolean;
  /** Read for the bridge only, never written: why. */
  left_out?: string;
};
export type EstateWorks = {
  categories: EstateCategory[];
  groups: EstateGroup[];
  works: EstateWork[];
  notes: string[];
};

function text(cell: Cell): string {
  return (cell ?? "").replace(/\s+/g, " ").trim();
}

function rate(cell: Cell, where: string): number | null {
  const value = text(cell);
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`${where}: "${value}" is not a rate.`);
  return Math.round(parsed * 100) / 100;
}

const UOMS: Record<string, string> = {
  m3: "cum",
  cum: "cum",
  sqft: "sqft",
  sft: "sqft",
  rft: "rft",
  nos: "nos",
  lumpsum: "lumpsum",
  pali: "pali",
  "per pali": "pali",
};

/** A percentage in the unit column is a share of the stage's rate per sqft; the rate beside it is already that share. */
export const isShare = (unit: string) => /^\d+(\.\d+)?\s*%$/.test(unit) || /^0?\.\d+$/.test(unit);

function uomOf(unit: string, where: string): string | null {
  if (unit === "") return null;
  if (isShare(unit)) return "sqft";
  const uom = UOMS[unit.toLowerCase()];
  if (!uom) throw new Error(`${where}: unknown unit "${unit}".`);
  return uom;
}

/** How a package work reads beside its stage, so it never looks like the sub-work of the same name. */
export const PACKAGE = "package per sqft";

/** A row the sheet repeats: kept out, as the earlier import did. */
export const LEFT_OUT: { code: string; name: string; why: string }[] = [
  {
    code: "FD.02.01",
    name: "FD - Dry Rubble Masonry",
    why: "repeats FD.02.04, which carries the rate",
  },
];

const PREFIX = /^(FD|SS|PF|F|LP|MEP|CAR|SM) - /;
export const cleanWorkName = (name: string) =>
  text(name)
    .replace(PREFIX, "")
    .replace(/\bMoiner\b/g, "Monier");

/** Names the sheet repeats under different floors take the floor their group names. */
const FLOOR: Record<string, string> = {
  "SS.01.02": "GF",
  "SS.01.03": "GF",
  "SS.01.04": "GF",
  "SS.01.05": "GF",
  "SS.06.02": "FF",
  "SS.06.03": "FF",
  "SS.06.04": "FF",
  "SS.06.05": "FF",
  "MEP.02.01": "GF",
  "MEP.03.01": "FF",
};

/**
 * In the Finishes section the Remarks column sits one row below its work: the ₹22 floor tiling has no remark and
 * "Tile Laying … - Floor" stands beside the ₹35 wall rate. Each Finishes remark is read from the row below; these
 * pairs must still hold, so a corrected sheet stops the run instead of shifting every scope the other way.
 */
export const FINISHES_SHIFT: { code: string; remarkBelow: string }[] = [
  { code: "F.01.02", remarkBelow: "Joinery" },
  { code: "F.02.02", remarkBelow: "Tile Laying (2x2, 2x4, 2x6) - Floor" },
  { code: "F.02.14", remarkBelow: "Epoxy (Including Acid Wash)" },
  { code: "F.04.15", remarkBelow: "Large Fabricated Duct Door" },
];

type Line = {
  row: number;
  stage: string;
  code: string;
  heading: string;
  work: string;
  unit: string;
  rate: Cell;
  remark: string;
};

function linesOf(rows: SheetRow[], sheet: string, expected: string[]): Line[] {
  const header = rows.find((r) => r.cells.some((c) => text(c) !== ""));
  const ok =
    header !== undefined &&
    expected.every((label, i) => text(header.cells[i]).toLowerCase() === label.toLowerCase());
  if (!header || !ok) {
    throw new Error(
      `The "${sheet}" sheet no longer starts with the columns ${expected.join(", ")} — the importer was written for that layout.`,
    );
  }
  return rows
    .filter((r) => r.row > header.row)
    .map(({ row, cells }) => ({
      row,
      stage: text(cells[0]),
      code: text(cells[1]),
      heading: text(cells[2]),
      work: text(cells[3]),
      unit: text(cells[4]),
      rate: cells[5],
      remark: text(cells[6]),
    }))
    .filter((l) => l.stage || l.code || l.heading || l.work || l.remark);
}

export const INFRA_COLUMNS = [
  "Stage",
  "Code",
  "Work Description",
  "Labour Description",
  "Unit",
  "Unit Rate",
];

function familyOf(stage: string): { family: Family; category: string | null } {
  if (stage.startsWith("Buildings - "))
    return { family: "Buildings", category: stage.slice(12).trim() };
  const family = FAMILIES.find((f) => f.toLowerCase() === stage.toLowerCase());
  if (!family) throw new Error(`"${stage}" is not one of the families ${FAMILIES.join(", ")}.`);
  return { family, category: null };
}

/** The fixes this sheet needs; tests hand in their own. */
export type SheetFixes = { finishesShift: typeof FINISHES_SHIFT; leftOut: typeof LEFT_OUT };

/** The "Infrastructure - Work" sheet: every family but Maintenance, read by the shape of each row. */
export function infrastructureWorks(
  rows: SheetRow[],
  { finishesShift, leftOut: leftOutRows }: SheetFixes = {
    finishesShift: FINISHES_SHIFT,
    leftOut: LEFT_OUT,
  },
): EstateWorks {
  const lines = linesOf(rows, "Infrastructure - Work", INFRA_COLUMNS);
  const out: EstateWorks = { categories: [], groups: [], works: [], notes: [] };
  let family: Family | null = null;
  let finishes = false;
  let category: EstateCategory | null = null;
  let group: EstateGroup | null = null;
  let order = 0;
  const shiftSeen = new Set<string>();
  const leftSeen = new Set<string>();

  const startCategory = (name: string) => {
    if (!family) throw new Error(`"${name}" comes before any family.`);
    category = { code: "", name, family, sort_order: 0 };
    out.categories.push(category);
    group = null;
  };
  const claimCode = (code: string, row: number): EstateCategory => {
    if (!category) throw new Error(`Infrastructure row ${row}: ${code} comes before any category.`);
    const prefix = code.split(".")[0];
    if (category.code === "") {
      if (out.categories.some((c) => c.code === prefix))
        throw new Error(
          `Infrastructure row ${row}: ${prefix} starts a second category ("${category.name}").`,
        );
      category.code = prefix;
    } else if (prefix !== category.code) {
      throw new Error(
        `Infrastructure row ${row}: ${code} sits under ${category.code} "${category.name}".`,
      );
    }
    return category;
  };

  lines.forEach((line, i) => {
    const where = `Infrastructure row ${line.row}`;
    if (line.stage) {
      const next = familyOf(line.stage);
      family = next.family;
      finishes = next.category === "Finishes";
      if (next.category) startCategory(next.category);
      else category = null;
    }
    if (line.heading && !line.code) {
      if (family === "Buildings")
        throw new Error(`${where}: "${line.heading}" has no code — a Buildings heading needs one.`);
      startCategory(line.heading);
      return;
    }
    if (!line.code) {
      if (line.work) throw new Error(`${where}: "${line.work}" has no code.`);
      return;
    }
    order += 10;
    const cat = claimCode(line.code, line.row);
    if (line.heading) {
      group = {
        code: line.code,
        category: cat.code,
        name: cleanWorkName(line.heading),
        sort_order: order,
      };
      out.groups.push(group);
      const r = rate(line.rate, where);
      if (line.unit !== "" || r !== null) {
        if (!isShare(line.unit) || r === null)
          throw new Error(`${where}: a group heading carries a rate only as a share per sqft.`);
        out.works.push({
          code: `${line.code}.00`,
          category: cat.code,
          group: line.code,
          name: `${group.name} — ${PACKAGE}`,
          sort_order: order + 1,
          uom: "sqft",
          labour_rate: r,
          is_package: true,
        });
      }
      return;
    }
    if (!line.work) return;
    let remark = line.remark;
    if (finishes) {
      remark = lines[i + 1]?.remark ?? "";
      const anchor = finishesShift.find((s) => s.code === line.code);
      if (anchor) {
        if (remark !== anchor.remarkBelow)
          throw new Error(
            `${where}: ${line.code}'s remark is no longer on the row below — the Finishes fix in works-workbook.ts needs another look.`,
          );
        shiftSeen.add(anchor.code);
      }
    }
    const name =
      cleanWorkName(line.work) +
      (FLOOR[line.code] ? ` - ${FLOOR[line.code]}` : "") +
      (remark ? ` — ${remark}` : "");
    const uom = uomOf(line.unit, where);
    const r = rate(line.rate, where);
    if (r !== null && uom === null)
      throw new Error(`${where} (${line.code}): a rate with no unit.`);
    const leftOut = leftOutRows.find((l) => l.code === line.code && l.name === line.work);
    if (leftOut) leftSeen.add(leftOut.code);
    out.works.push({
      ...(leftOut ? { left_out: leftOut.why } : {}),
      code: line.code,
      category: cat.code,
      group: group?.code ?? null,
      name,
      sort_order: order,
      uom,
      labour_rate: r,
      is_package: isShare(line.unit),
    });
  });

  for (const s of finishesShift) {
    if (!shiftSeen.has(s.code))
      throw new Error(
        `The works sheet no longer has ${s.code} — re-check the Finishes fix in works-workbook.ts.`,
      );
  }
  for (const l of leftOutRows) {
    if (!leftSeen.has(l.code))
      throw new Error(
        `The works sheet no longer has ${l.code} "${l.name}" — re-check LEFT_OUT in works-workbook.ts.`,
      );
  }
  for (const c of out.categories) {
    if (c.code === "") throw new Error(`"${c.name}" has no works under it.`);
  }
  return out;
}

export const SHORT_COLUMNS = ["Stage", "Code", "Work description"];

/** "Mobilisation - Works": one category of ungrouped works. */
export function mobilisationWorks(rows: SheetRow[]): EstateWorks {
  const lines = linesOf(rows, "Mobilisation - Works", SHORT_COLUMNS);
  const works: EstateWork[] = lines
    .filter((l) => l.code)
    .map((l, i) => {
      const name = cleanWorkName(l.heading);
      if (!name) throw new Error(`Mobilisation row ${l.row}: ${l.code} has no description.`);
      if (!l.code.startsWith("SM."))
        throw new Error(`Mobilisation row ${l.row}: ${l.code} is not an SM code.`);
      return {
        code: l.code,
        category: "SM",
        group: null,
        name,
        sort_order: (i + 1) * 10,
        uom: null,
        labour_rate: null,
        is_package: false,
      };
    });
  return {
    categories: [
      { code: "SM", name: "Site Mobilisation", family: "Site Mobilisation", sort_order: 0 },
    ],
    groups: [],
    works,
    notes: [],
  };
}

/** "Maintenance - Works": one category, its sections the groups (MAIN.S1 …), since the works share MAIN's numbers. */
export function maintenanceWorks(rows: SheetRow[]): EstateWorks {
  const lines = linesOf(rows, "Maintenance - Works", SHORT_COLUMNS);
  const out: EstateWorks = {
    categories: [{ code: "MAIN", name: "Maintenance", family: "Maintenance", sort_order: 0 }],
    groups: [],
    works: [],
    notes: [],
  };
  let group: EstateGroup | null = null;
  let order = 0;
  for (const l of lines) {
    order += 10;
    if (l.stage) {
      group = {
        code: `MAIN.S${out.groups.length + 1}`,
        category: "MAIN",
        name: l.stage,
        sort_order: order,
      };
      out.groups.push(group);
    }
    if (!l.code) continue;
    if (!l.code.startsWith("MAIN."))
      throw new Error(`Maintenance row ${l.row}: ${l.code} is not a MAIN code.`);
    if (!group) throw new Error(`Maintenance row ${l.row}: ${l.code} comes before any section.`);
    out.works.push({
      code: l.code,
      category: "MAIN",
      group: group.code,
      name: cleanWorkName(l.heading),
      sort_order: order,
      uom: null,
      labour_rate: null,
      is_package: false,
    });
  }
  return out;
}

/** The three sheets as one list, families in order, every code once across categories, groups and works. */
export function estateWorks(
  sheets: { infrastructure: SheetRow[]; mobilisation: SheetRow[]; maintenance: SheetRow[] },
  fixes?: SheetFixes,
): EstateWorks {
  const parts = [
    mobilisationWorks(sheets.mobilisation),
    infrastructureWorks(sheets.infrastructure, fixes),
    maintenanceWorks(sheets.maintenance),
  ];
  const all: EstateWorks = {
    categories: parts.flatMap((p) => p.categories),
    groups: parts.flatMap((p) => p.groups),
    works: parts.flatMap((p) => p.works),
    notes: parts.flatMap((p) => p.notes),
  };
  const rank = (f: Family) => FAMILIES.indexOf(f);
  all.categories.sort((a, b) => rank(a.family) - rank(b.family));
  all.categories.forEach((c, i) => (c.sort_order = (i + 1) * 10));

  const codes = new Set<string>();
  for (const entry of [...all.categories, ...all.groups, ...all.works]) {
    if (codes.has(entry.code)) throw new Error(`Works: ${entry.code} is used twice.`);
    codes.add(entry.code);
  }
  // A name repeated within a category (Subgrade Preparation under three kinds of road) takes its group's name.
  const live = all.works.filter((w) => !w.left_out);
  const count = new Map<string, number>();
  const keyOf = (w: EstateWork) => `${w.category}|${w.name.toLowerCase()}`;
  for (const w of live) count.set(keyOf(w), (count.get(keyOf(w)) ?? 0) + 1);
  const groupName = new Map(all.groups.map((g) => [g.code, g.name]));
  for (const w of live.filter((x) => (count.get(keyOf(x)) ?? 0) > 1)) {
    const g = w.group ? groupName.get(w.group) : undefined;
    if (!g)
      throw new Error(
        `${w.code} "${w.name}" repeats in its category with no group to tell it apart.`,
      );
    const [base, ...scope] = w.name.split(" — ");
    w.name = [`${base} (${g})`, ...scope].join(" — ");
  }
  const seen = new Map<string, string>();
  for (const w of live) {
    const first = seen.get(keyOf(w));
    if (first) throw new Error(`${first} and ${w.code} are both "${w.name}" in one group.`);
    seen.set(keyOf(w), w.code);
  }
  return all;
}

// The bridge: the "Villas - Work" sheet still uses today's codes and lines up row for row with the
// Buildings section, so it says which new code each of today's works became.

const VILLA_STAGES: Record<string, string> = {
  foundation: "FD",
  "super structure": "SS",
  "pre-finishes": "PF",
  finishes: "F",
  landscape: "LP",
  mep: "MEP",
  carpentry: "CAR",
};
/** The villas sheet's one stage the Buildings section has no place for. */
const VILLA_STAGES_DROPPED = new Set(["engineering consultation"]);

export type BridgeEntry = {
  category: string;
  oldCode: string;
  oldName: string;
  newCode: string | null;
};

/** Pairs each villas-sheet heading and work with the Buildings row in the same place. */
export function villaBridge(villaRows: SheetRow[], estate: EstateWorks): BridgeEntry[] {
  const lines = linesOf(villaRows, "Villas - Work", [
    "Stage",
    "Code",
    "Work description",
    "Labour description",
    "Unit",
  ]);
  const byStage = new Map<string, { headings: Line[]; works: Line[] }>();
  let stage: string | null = null;
  for (const line of lines) {
    if (line.stage) {
      const key = line.stage.toLowerCase();
      if (VILLA_STAGES_DROPPED.has(key)) stage = null;
      else {
        stage = VILLA_STAGES[key] ?? null;
        if (!stage)
          throw new Error(
            `Villas row ${line.row}: "${line.stage}" is not a stage the importer knows.`,
          );
        byStage.set(stage, { headings: [], works: [] });
      }
    }
    if (!stage) continue;
    const bucket = byStage.get(stage)!;
    if (line.work) bucket.works.push(line);
    else if (line.heading) bucket.headings.push(line);
  }

  const entries: BridgeEntry[] = [];
  for (const [cat, { headings, works }] of byStage) {
    const groups = estate.groups.filter((g) => g.category === cat);
    const rows = estate.works.filter((w) => w.category === cat && !w.code.endsWith(".00"));
    if (headings.length !== groups.length)
      throw new Error(
        `${cat}: the villas sheet has ${headings.length} headings, the new sheet ${groups.length} groups.`,
      );
    if (works.length !== rows.length)
      throw new Error(
        `${cat}: the villas sheet has ${works.length} works, the new sheet ${rows.length}.`,
      );
    headings.forEach((h, i) => {
      const pkg = estate.works.find((w) => w.code === `${groups[i].code}.00`);
      entries.push({
        category: cat,
        oldCode: h.code,
        oldName: cleanWorkName(h.heading),
        newCode: pkg?.code ?? null,
      });
    });
    works.forEach((w, i) => {
      entries.push({
        category: cat,
        oldCode: w.code,
        oldName: cleanWorkName(w.work),
        newCode: rows[i].code,
      });
    });
  }
  return entries;
}

// Matching today's works to the new rows.

export type DbWork = {
  id: string;
  code: string;
  category: string;
  name: string;
  uses: number;
  priced: boolean;
};

const WORDS: [RegExp, string][] = [
  [/\b1-side\b/gi, "one-side"],
  [/\b2-side\b/gi, "two-side"],
  [/&/g, " and "],
];

/** A name without its scope, floor kept, in a form that survives the sheet's spelling changes. */
export function nameKey(name: string): string {
  let n = cleanWorkName(name.split(" — ")[0]);
  for (const [from, to] of WORDS) n = n.replace(from, to);
  return looseKey(n);
}

/** The same, floor dropped too: the villas sheet names "1-Side Plastered Wall Masonry" without the GF today's list added. */
export function baseKey(name: string): string {
  return nameKey(cleanWorkName(name.split(" — ")[0]).replace(/ - (GF|FF|Attic)$/i, ""));
}

/** The whole name, scope included, in the same form. */
export function fullKey(name: string): string {
  const [base, ...scope] = name.split(" — ");
  return `${baseKey(base)}|${looseKey(scope.join(" "))}`;
}

/** Old codes the earlier importer changed on the way in, put back to the villas sheet's spelling. */
const OLD_SPELLING: Record<string, string> = Object.fromEntries(
  "abcdefghijklmnopqrs".split("").map((c) => [`PF.20${c}`, `PF.2${c}`]),
);

/** What no rule finds, decided by hand: today's code and name → the new code, or null to switch it off. */
export const WORK_REMAPS: { code: string; name: string; becomes: string | null }[] = [
  // Priced 18.4 and heading SS.7a–7g, the first-floor block work: its name is the next stage's.
  { code: "SS.7", name: "First Floor Lintel Beam Works", becomes: "SS.06.00" },
  // Today's names lost the "MD" the sheet gives these two.
  { code: "F.1.39", name: "Joinery Shutter Fixing - Double Door", becomes: "CAR.01.11" },
  { code: "F.1.40", name: "Joinery Shutter Making - Double Door", becomes: "CAR.01.12" },
  // Renamed in the new sheet, same place and rate.
  { code: "F.1.54", name: "NMR D&W Refixing Work", becomes: "CAR.02.13" },
  { code: "F.1.55", name: "Revision Column", becomes: "CAR.02.14" },
  { code: "F.1.60", name: "RGB Glass Fixing", becomes: "CAR.02.18" },
  { code: "F.1.61", name: "Lift Area Closing", becomes: "CAR.02.19" },
  { code: "LP.1", name: "PCC", becomes: "LP.02.01" },
  { code: "LP.3", name: "Seater Civil Works", becomes: "LP.04.01" },
  { code: "LP.9", name: "Plantation Works", becomes: "LP.05.01" },
  { code: "LP.12", name: "Concrete Swale Work", becomes: "LP.07.01" },
  { code: "LP.15", name: "Main Entrance Design Work", becomes: "LP.02.10" },
  { code: "LP.17", name: "Bollard Pedestal Laying Work", becomes: "LP.08.01" },
  { code: "LP.20", name: "External Chamber Cover Fixing", becomes: "LP.07.02" },
  { code: "LP.28", name: "Soak Pit Cover Precasting Work", becomes: "LP.07.05" },
  { code: "LP.32", name: "Pole Light Pedestal Work", becomes: "LP.08.02" },
];

export type Match = { work: DbWork; newCode: string | null; how: string };

export function matchWorks(
  db: DbWork[],
  estate: EstateWorks,
  bridge: BridgeEntry[],
  remaps: typeof WORK_REMAPS = WORK_REMAPS,
): { matches: Match[]; notes: string[] } {
  const notes: string[] = [];
  const live = estate.works.filter((w) => !w.left_out);
  const newByCode = new Map(live.map((w) => [w.code, w]));
  const groupName = new Map(estate.groups.map((g) => [g.code, g.name]));
  const packages = live.filter((w) => w.is_package);
  const unique = (codes: (string | null)[]) => {
    const set = [...new Set(codes)];
    return set.length === 1 ? set[0] : null;
  };
  const matches: Match[] = [];

  for (const remap of remaps) {
    if (!db.some((w) => w.code === remap.code && w.name === remap.name))
      throw new Error(
        `${remap.code} "${remap.name}" is no longer in Masters — re-check WORK_REMAPS.`,
      );
    if (remap.becomes && !newByCode.has(remap.becomes))
      throw new Error(
        `WORK_REMAPS sends ${remap.code} to ${remap.becomes}, which the sheet no longer has.`,
      );
  }

  for (const work of db) {
    const key = baseKey(work.name);
    const exact = nameKey(work.name);
    const remap = remaps.find((r) => r.code === work.code && r.name === work.name);
    let found: { code: string | null; how: string } | null = remap
      ? { code: remap.becomes, how: "by hand" }
      : null;

    if (!found) {
      const same = newByCode.get(work.code);
      if (same && baseKey(same.name) === key) found = { code: same.code, how: "same code" };
    }
    // A priced work is a stage's share per sqft: it becomes that stage's package.
    if (!found && work.priced) {
      const inCat = packages.filter((p) => p.category === work.category);
      const stage = (p: EstateWork) => groupName.get(p.group ?? "") ?? "";
      const code =
        unique(inCat.filter((p) => nameKey(stage(p)) === exact).map((p) => p.code)) ??
        unique(inCat.filter((p) => baseKey(stage(p)) === key).map((p) => p.code));
      if (code) found = { code, how: "the stage's package" };
    }
    if (!found) {
      const old = OLD_SPELLING[work.code] ?? work.code;
      const code = unique(
        bridge
          .filter((b) => b.oldCode === old && b.newCode && baseKey(b.oldName) === key)
          .map((b) => b.newCode),
      );
      if (code) found = { code, how: `villas sheet ${old}` };
    }
    if (!found) {
      const named = bridge.filter((b) => b.newCode && b.category === work.category);
      const code =
        unique(named.filter((b) => nameKey(b.oldName) === exact).map((b) => b.newCode)) ??
        unique(named.filter((b) => baseKey(b.oldName) === key).map((b) => b.newCode));
      if (code) found = { code, how: "same name on the villas sheet" };
    }
    if (!found) {
      const code = unique(
        live
          .filter((w) => w.category === work.category && fullKey(w.name) === fullKey(work.name))
          .map((w) => w.code),
      );
      if (code) found = { code, how: "same name" };
    }

    matches.push({ work, newCode: found?.code ?? null, how: found?.how ?? "no match" });
  }

  // Two of today's works for one new row: the one in use, then priced, then the lower code keeps it.
  const claims = new Map<string, Match[]>();
  for (const m of matches)
    if (m.newCode) claims.set(m.newCode, [...(claims.get(m.newCode) ?? []), m]);
  for (const [code, rivals] of claims) {
    if (rivals.length < 2) continue;
    rivals.sort(
      (a, b) =>
        b.work.uses - a.work.uses ||
        Number(b.work.priced) - Number(a.work.priced) ||
        a.work.code.localeCompare(b.work.code),
    );
    for (const loser of rivals.slice(1)) {
      notes.push(
        `${loser.work.code} "${loser.work.name}" and ${rivals[0].work.code} both became ${code} — ${rivals[0].work.code} keeps it.`,
      );
      loser.newCode = null;
      loser.how = `repeats ${rivals[0].work.code}`;
    }
  }
  return { matches, notes };
}
