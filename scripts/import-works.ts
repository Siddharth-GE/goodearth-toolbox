/**
 * Loads the works vocabulary (0073) from the site team's estimation
 * workbook — Book1.xlsx, "Works " sheet — into work_groups and
 * work_items. The nine categories are seeded by the migration itself.
 *
 *   npx tsx scripts/import-works.ts --project <ref>            # dry run
 *   npx tsx scripts/import-works.ts --project <ref> --commit   # write
 *
 * The sheet is a working document, so the data is transcribed here with
 * judgement rather than parsed from a CSV (the import-staff precedent).
 * Unlike the pre-split importers this one goes through the management
 * API with a REQUIRED --project — nothing here defaults a database.
 *
 * Cleaning applied in the transcription, each marked with a comment:
 *   - Placeholder rows are simply not transcribed: descriptions of "0"
 *     (SM.9–14, FD.33–38, SS.29, SS.39–41, PF.40–43, LP.15–18,
 *     MEP.17–22) and the empty IN.6–13.
 *   - Category prefixes ("FD-", "SS-", …) are stripped from names; the
 *     code column carries them.
 *   - The sheet numbers F.20 twice — the "Joinery shutter works" item
 *     AND the "External Finishes" header. Decided 2026-08-19: the item
 *     keeps F.20, the header becomes F.21, and the sheet's F.21–F.34
 *     shift up one to F.22–F.35.
 *   - Evident misspellings are corrected (Retaing→Retaining,
 *     Masonary→Masonry, Cieling→Ceiling, plumping→plumbing,
 *     fabriction→fabrication, purline→purlin, Thread→Tread (stairs),
 *     copping→coping, Sock pits→Soak pits, Mangloor/Manglore→Mangalore,
 *     Panneling→Panelling, Carpentery→Carpentry, Sleev→Sleeve,
 *     Baywindow→Bay window, Moiner→Monier, Prime→Primer). The dry run
 *     prints every row so the list can be argued with before writing.
 *
 * Group membership follows the sheet's reading order — an item belongs
 * to the section header above it — except where the content plainly
 * says otherwise: PF.30 onward (stair fabrication, waterproofing, core
 * drilling…) are not "Roof Fabrication", and MEP's external works are
 * not "Internal Electrical"/"Internal Plumbing", so those hang off the
 * category directly. The dry run prints the whole tree for review.
 *
 * Natural key: code. A re-run finds everything present and unchanged
 * and writes nothing.
 */
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

type SheetItem = { code: string; name: string };
type SheetEntry = SheetItem & { items?: SheetItem[] };
type SheetCategory = { code: string; entries: SheetEntry[] };

// An entry with `items` is a group (the sheet's inline section header);
// one without is a work item hanging directly off the category.
const SHEET: SheetCategory[] = [
  { code: "ENC", entries: [] }, // the sheet has the header only — no work lines yet
  {
    code: "SM",
    entries: [
      { code: "SM.1", name: "Site Formation" },
      { code: "SM.2", name: "Establishing bench mark levels" },
      { code: "SM.3", name: "Temporary Water Supply" },
      { code: "SM.4", name: "Temporary Power Supply" },
      { code: "SM.5", name: "Site office - works & maintenance" },
      { code: "SM.6", name: "Labour camp - works & maintenance" },
      { code: "SM.7", name: "Carpentry shed - works & maintenance" }, // sheet: Carpentery
      { code: "SM.8", name: "Other works & maintenance" },
      // SM.9–SM.14: "0" placeholders, not transcribed
    ],
  },
  {
    code: "FD",
    entries: [
      { code: "FD.1", name: "Total station Marking" },
      { code: "FD.2", name: "Setting out" },
      {
        code: "FD.3",
        name: "Dry rubble footing",
        items: [
          { code: "FD.4", name: "Excavation for rubble foundation" },
          { code: "FD.5", name: "Pit cleaning for rubble foundation" },
          { code: "FD.6", name: "Dry rubble masonry" },
          { code: "FD.7", name: "Random rubble masonry" },
          { code: "FD.8", name: "Dust filling" },
          { code: "FD.9", name: "Laterite basement masonry" },
          { code: "FD.10", name: "Plinth protection concrete" },
        ],
      },
      {
        code: "FD.11",
        name: "Isolated footing",
        items: [
          { code: "FD.12", name: "Excavation for Isolated footing" },
          { code: "FD.13", name: "Pit cleaning for Isolated Footing" },
          { code: "FD.14", name: "PCC for Isolated footing" },
          { code: "FD.15", name: "Footing" },
          { code: "FD.16", name: "Column upto plinth bottom" },
          { code: "FD.17", name: "Soil back filling" },
        ],
      },
      {
        code: "FD.18",
        name: "Pile foundation",
        items: [
          { code: "FD.19", name: "Excavation of Claypit" },
          { code: "FD.20", name: "Pile Foundation" },
          { code: "FD.21", name: "Chipping Pile Head" },
          { code: "FD.22", name: "Pile Head Re-casting" },
          { code: "FD.23", name: "Pile cap Casting" },
        ],
      },
      {
        code: "FD.24",
        name: "Plinth beam",
        items: [
          { code: "FD.25", name: "PCC For plinth beam" },
          { code: "FD.26", name: "Masonry for plinth beam" }, // sheet: Masonary
          { code: "FD.27", name: "Plinth beam & DPC Reinforcement work" },
          { code: "FD.28", name: "Plinth beam & DPC shuttering work" },
          { code: "FD.29", name: "Water tank work" },
          { code: "FD.30", name: "Retaining wall work" }, // sheet: Retaing
          { code: "FD.31", name: "Plinth beam & DPC casting" },
          { code: "FD.32", name: "Mullion" },
        ],
      },
      // FD.33–FD.38: "0" placeholders, not transcribed
    ],
  },
  {
    code: "SS",
    entries: [
      { code: "SS.1", name: "Curing" },
      {
        code: "SS.2",
        name: "Ground Floor works",
        items: [
          { code: "SS.3", name: "Block Work GF" },
          { code: "SS.4", name: "1 side plastered wall masonry" },
          { code: "SS.5", name: "2 sides plastered wall masonry" },
          { code: "SS.6", name: "2 side exposed wall masonry" },
          { code: "SS.7", name: '4" Wall masonry' },
          { code: "SS.8", name: "Sill concrete GF" },
          { code: "SS.9", name: "Bay window GF" }, // sheet: Baywindow
          { code: "SS.10", name: "Mid-landing Beam GF" },
          { code: "SS.11", name: "Anti-Termite Treatment" },
          { code: "SS.12", name: "Floor PCC GF" },
          { code: "SS.13", name: "Ground Floor Lintel Beam" },
          { code: "SS.14", name: "Light roof beam GF" },
          { code: "SS.15", name: "Ground floor slab casting" },
          { code: "SS.16", name: "Soil formation for PCC" },
          { code: "SS.17", name: "GF column casting" },
        ],
      },
      {
        code: "SS.18",
        name: "First Floor works",
        items: [
          { code: "SS.19", name: "Block Work FF" },
          { code: "SS.20", name: "1 side plastered wall masonry" },
          { code: "SS.21", name: "2 sides plastered wall masonry" },
          { code: "SS.22", name: "2 side exposed wall masonry" },
          { code: "SS.23", name: '4" Wall masonry' },
          { code: "SS.24", name: "Sill concrete FF" },
          { code: "SS.25", name: "Bay window FF" }, // sheet: Baywindow
          { code: "SS.26", name: "First Floor Lintel Beam" }, // sheet: FirstFloor
          { code: "SS.27", name: "Light roof beam FF" },
          { code: "SS.28", name: "First Floor slab casting" },
          // SS.29: "0" placeholder, not transcribed
          { code: "SS.30", name: "FF column casting" },
        ],
      },
      {
        code: "SS.31",
        name: "Attic Floor",
        items: [
          { code: "SS.32", name: "Attic Floor Block Work / upto bed block" },
          { code: "SS.33", name: "1 side plastered wall masonry" },
          { code: "SS.34", name: "2 sides plastered wall masonry" },
          { code: "SS.35", name: "Bed Concrete" },
          { code: "SS.36", name: "RCC stair" },
          { code: "SS.37", name: "Block Work SF" },
          { code: "SS.38", name: "Second Floor Lintel Beam" }, // sheet: SecondFloor
        ],
      },
      // SS.39–SS.41: "0" placeholders, not transcribed
    ],
  },
  {
    code: "PF",
    entries: [
      {
        code: "PF.1",
        name: "Plastering",
        items: [
          { code: "PF.2", name: "Bull marking" },
          { code: "PF.3", name: "Rough Plastering GF" },
          { code: "PF.4", name: "Wall Plastering GF" },
          { code: "PF.5", name: "Ceiling Plastering GF" },
          { code: "PF.6", name: "Mesh Plastering" },
          { code: "PF.7", name: "Hacking" },
          { code: "PF.8", name: "Rough Plastering FF" },
          { code: "PF.9", name: "Wall Plastering FF" },
          { code: "PF.10", name: "Ceiling Plastering FF" },
          { code: "PF.11", name: "Rough Plastering above FF" },
          { code: "PF.12", name: "Wall Plastering above FF" },
          { code: "PF.13", name: "Ceiling Plastering above FF" },
          { code: "PF.14", name: "Scaffolding rate for plastering" },
        ],
      },
      {
        code: "PF.15",
        name: "Screed",
        items: [
          { code: "PF.16", name: "Screed concreting - Ground Floor" },
          { code: "PF.17", name: "Screed concreting - First Floor" },
          { code: "PF.18", name: "Screed concreting and grouting - Attic" },
        ],
      },
      {
        code: "PF.19",
        name: "Roof Fabrication",
        items: [
          { code: "PF.20", name: "Roof Fabrication (double purlin)" }, // sheet: purline
          { code: "PF.21", name: "Roof Fabrication (single purlin)" },
          { code: "PF.22", name: "Painting for Roof Fabrication (single purlin)" },
          { code: "PF.23", name: "Painting for Roof Fabrication (double purlin)" },
          { code: "PF.24", name: "Ceiling tile paving in roof fabrication" }, // sheet: Cieling…fabriction
          { code: "PF.25", name: "Monier sheet laying for roof fabrication" }, // sheet: Moiner
          { code: "PF.26", name: "Mangalore tile paving in roof fabrication" }, // sheet: Mangloor
          { code: "PF.27", name: "Aluminium Gutter Fabrication" },
          { code: "PF.28", name: "Zycosil applying for roof tiles" },
          { code: "PF.29", name: "Painting for Roof Tile" },
        ],
      },
      // PF.30 onward are not roof works — they hang off the category.
      { code: "PF.30", name: "Stair Fabrication" },
      { code: "PF.31", name: "Hand Railing Fabrication" },
      { code: "PF.32", name: "Joinery Frame Fixing" },
      { code: "PF.33", name: "Dead Mortar Chipping" },
      { code: "PF.34", name: "Core Drilling" },
      { code: "PF.35", name: "Water Proofing Works" },
      { code: "PF.36", name: "Cinder Filling at sunken slab" },
      { code: "PF.37", name: "Joinery frame work" },
      { code: "PF.38", name: "Floor PCC at sunken slabs" },
      { code: "PF.39", name: "Coving for Mangalore tile roofing" }, // sheet: Manglore
      // PF.40–PF.43: "0" placeholders, not transcribed
    ],
  },
  {
    code: "F",
    entries: [
      {
        code: "F.1",
        name: "Internal Finishing works",
        items: [
          { code: "F.2", name: "Joinery frame work" },
          { code: "F.3", name: "Polishing Works" },
          { code: "F.4", name: "Floor Tiling" },
          { code: "F.5", name: "Tile marking" },
          { code: "F.6", name: "Floor Tiling Work" },
          { code: "F.7", name: "Floor tile Cleaning" },
          { code: "F.8", name: "Floor tile Pointing" },
          { code: "F.9", name: "Wiring and switch board fixing" },
          { code: "F.10", name: "Shutter Fixing" },
          { code: "F.11", name: "Applying Paint" },
          { code: "F.12", name: "Applying Primer" }, // sheet: Prime
          { code: "F.13", name: "Applying Putty" },
          { code: "F.14", name: "Fabricated door of Duct" },
          { code: "F.15", name: "Wooden Panelling Works - window frame" }, // sheet: Panneling
          { code: "F.16", name: "Wooden Skirting Works" },
          { code: "F.17", name: "Wooden seating Work for Bay Window" },
          { code: "F.18", name: "Wooden Tread Work for Stair" }, // sheet: Thread
          { code: "F.19", name: "Wooden Hand Rail Works" },
          { code: "F.20", name: "Joinery shutter works" },
        ],
      },
      {
        // The sheet numbers this header F.20 too; renumbered — see file header.
        code: "F.21",
        name: "External Finishes",
        items: [
          { code: "F.22", name: "External Cladding Work" }, // sheet code: F.21
          { code: "F.23", name: "Exposed Wall Pointing" }, // sheet code: F.22, "Expose"
          { code: "F.24", name: "External Painting" }, // sheet code: F.23
          { code: "F.25", name: "Grinding and washing External Exposed Walls" }, // sheet code: F.24
          { code: "F.26", name: "Application of clear coat to the exposed wall" }, // sheet code: F.25
          { code: "F.27", name: "Chejja works" }, // sheet code: F.26, "chejja"
          { code: "F.28", name: "Final Cleaning and Snag" }, // sheet code: F.27
          { code: "F.29", name: "Wooden Panelling Works - Niche" }, // sheet code: F.28, Panneling
          { code: "F.30", name: "Coving for chejja" }, // sheet code: F.29, "cheja"
          { code: "F.31", name: "Wooden column" }, // sheet code: F.30
          { code: "F.32", name: "Jally fixing for duct, hand rail, parapet & brackets" }, // sheet code: F.31
          { code: "F.33", name: "Granite coping works" }, // sheet code: F.32, "copping"
          { code: "F.34", name: "Wooden coping and window sill panelling works" }, // sheet code: F.33
          { code: "F.35", name: "Application of Zycosil to the exposed wall" }, // sheet code: F.34
        ],
      },
    ],
  },
  {
    code: "LP",
    entries: [
      { code: "LP.1", name: "PCC" },
      { code: "LP.2", name: "Pathway stone paving works" },
      { code: "LP.3", name: "Seater civil works" },
      { code: "LP.4", name: "Seater stone works" },
      { code: "LP.5", name: "Car parking Civil works" }, // sheet: Carparking
      { code: "LP.6", name: "Car parking Fabrication works" },
      { code: "LP.7", name: "Car parking stone paving works" },
      { code: "LP.8", name: "Kerb-stone works" },
      { code: "LP.9", name: "Plantation works" },
      { code: "LP.10", name: "Soil formation" },
      { code: "LP.11", name: "Stamp concrete" },
      { code: "LP.12", name: "Concrete Swale work" },
      { code: "LP.13", name: "Ramp work" },
      { code: "LP.14", name: "Planter box work" },
      // LP.15–LP.18: "0" placeholders, not transcribed
    ],
  },
  {
    code: "MEP",
    entries: [
      { code: "MEP.1", name: "Sleeve work at foundation level" }, // sheet: Sleev
      {
        code: "MEP.2",
        name: "Internal Electrical",
        items: [
          { code: "MEP.3", name: "Slab Conduiting - Electrical and Communication" },
          { code: "MEP.4", name: "Wall chasing - Electrical and communication" },
          { code: "MEP.5", name: "Wiring" },
          { code: "MEP.6", name: "Switch fixing & switch plate fixing" },
          { code: "MEP.7", name: "Electrical fixtures installation" },
        ],
      },
      // External works are not "Internal …" — they hang off the category.
      { code: "MEP.8", name: "External Electrical Landscaping" },
      {
        code: "MEP.9",
        name: "Internal Plumbing",
        items: [
          { code: "MEP.10", name: "Fixing of CP fittings" },
          { code: "MEP.11", name: "Toilet and Kitchen Plumbing" }, // sheet: Plumping
        ],
      },
      { code: "MEP.12", name: "External Plumbing - Landscaping" },
      { code: "MEP.13", name: "External Plumbing - irrigation Tanks" },
      { code: "MEP.14", name: "External Plumbing - septic tanks & Soak pits" }, // sheet: Sock pits
      { code: "MEP.15", name: "External Plumbing - Chambers" },
      { code: "MEP.16", name: "Final Cleaning and Snag - Electrical and Plumbing" }, // sheet: plumping
      // MEP.17–MEP.22: "0" placeholders, not transcribed
    ],
  },
  {
    code: "IN",
    entries: [
      { code: "IN.1", name: "Cabinet Fabrication" },
      { code: "IN.2", name: "Shutter & Finish Installation" },
      { code: "IN.3", name: "Hardware Fittings & Accessories installation" },
      { code: "IN.4", name: "Backsplash / Wall Cladding works" },
      { code: "IN.5", name: "Electrical works" },
      // IN.6–IN.13: empty placeholder rows, not transcribed
    ],
  },
];

// ---------------------------------------------------------------------

type FlatGroup = { code: string; name: string; categoryCode: string; sortOrder: number };
type FlatItem = {
  code: string;
  name: string;
  categoryCode: string;
  groupCode: string | null;
  sortOrder: number;
};

function sortOrderFromCode(code: string): number {
  const match = code.match(/(\d+)$/);
  if (!match) throw new Error(`${code}: code has no numeric suffix`);
  return Number(match[1]) * 10;
}

function flatten(): { groups: FlatGroup[]; items: FlatItem[] } {
  const groups: FlatGroup[] = [];
  const items: FlatItem[] = [];
  for (const category of SHEET) {
    for (const entry of category.entries) {
      if (entry.items) {
        groups.push({
          code: entry.code,
          name: entry.name,
          categoryCode: category.code,
          sortOrder: sortOrderFromCode(entry.code),
        });
        for (const item of entry.items) {
          items.push({
            code: item.code,
            name: item.name,
            categoryCode: category.code,
            groupCode: entry.code,
            sortOrder: sortOrderFromCode(item.code),
          });
        }
      } else {
        items.push({
          code: entry.code,
          name: entry.name,
          categoryCode: category.code,
          groupCode: null,
          sortOrder: sortOrderFromCode(entry.code),
        });
      }
    }
  }
  return { groups, items };
}

function validate(groups: FlatGroup[], items: FlatItem[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const row of [...groups, ...items]) {
    const kind = "groupCode" in row ? "item" : "group";
    const previous = seen.get(row.code);
    if (previous) problems.push(`${row.code}: appears twice (${previous} and ${kind})`);
    seen.set(row.code, kind);
    const prefix = row.code.split(".")[0];
    if (prefix !== row.categoryCode) {
      problems.push(`${row.code}: prefix does not match its category ${row.categoryCode}`);
    }
    if (!row.name.trim()) problems.push(`${row.code}: empty name`);
  }
  return problems;
}

// ---------------------------------------------------------------------

type DbCategory = { id: string; code: string };
type DbGroup = { id: string; code: string; category_id: string; name: string; sort_order: number };
type DbItem = {
  id: string;
  code: string;
  category_id: string;
  group_id: string | null;
  name: string;
  sort_order: number;
};

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  const { groups, items } = flatten();
  const problems = validate(groups, items);
  if (problems.length > 0) {
    console.error("Transcription problems — nothing written:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  console.log(`Database : ${ref}`);
  console.log(`Sheet    : ${groups.length} groups, ${items.length} work items`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);

  const categories = await sql<DbCategory>(ref, "select id, code from work_categories");
  const categoryByCode = new Map(categories.map((c) => [c.code, c]));
  for (const category of SHEET) {
    if (!categoryByCode.has(category.code)) {
      console.error(`Category ${category.code} is missing — has migration 0073 been applied?`);
      process.exit(1);
    }
  }

  const dbGroups = await sql<DbGroup>(
    ref,
    "select id, code, category_id, name, sort_order from work_groups",
  );
  const dbItems = await sql<DbItem>(
    ref,
    "select id, code, category_id, group_id, name, sort_order from work_items",
  );
  const dbGroupByCode = new Map(dbGroups.map((g) => [g.code, g]));
  const dbItemByCode = new Map(dbItems.map((i) => [i.code, i]));

  const statements: string[] = [];
  let added = 0;
  let changed = 0;
  let unchanged = 0;

  const markGroup = (group: FlatGroup): string => {
    const existing = dbGroupByCode.get(group.code);
    const categoryId = categoryByCode.get(group.categoryCode)!.id;
    if (!existing) {
      added += 1;
      statements.push(
        `insert into work_groups (category_id, code, name, sort_order)
         values (${literal(categoryId)}, ${literal(group.code)}, ${literal(group.name)}, ${group.sortOrder})
         on conflict (code) do nothing;`,
      );
      return "+";
    }
    if (
      existing.name === group.name &&
      existing.category_id === categoryId &&
      existing.sort_order === group.sortOrder
    ) {
      unchanged += 1;
      return "=";
    }
    changed += 1;
    // category never changes in place — the sheet's categories are stable
    // and moving one would drag its items' composite FK with it. Name and
    // order only.
    statements.push(
      `update work_groups set name = ${literal(group.name)}, sort_order = ${group.sortOrder}
       where code = ${literal(group.code)};`,
    );
    return "~";
  };

  const markItem = (item: FlatItem): string => {
    const existing = dbItemByCode.get(item.code);
    const categoryId = categoryByCode.get(item.categoryCode)!.id;
    const groupSelect = item.groupCode
      ? `(select id from work_groups where code = ${literal(item.groupCode)})`
      : "null";
    if (!existing) {
      added += 1;
      statements.push(
        `insert into work_items (category_id, group_id, code, name, sort_order)
         values (${literal(categoryId)}, ${groupSelect}, ${literal(item.code)}, ${literal(item.name)}, ${item.sortOrder})
         on conflict (code) do nothing;`,
      );
      return "+";
    }
    const existingGroupCode = existing.group_id
      ? (dbGroups.find((g) => g.id === existing.group_id)?.code ?? null)
      : null;
    if (
      existing.name === item.name &&
      existing.category_id === categoryId &&
      existingGroupCode === item.groupCode &&
      existing.sort_order === item.sortOrder
    ) {
      unchanged += 1;
      return "=";
    }
    changed += 1;
    statements.push(
      `update work_items set name = ${literal(item.name)}, group_id = ${groupSelect}, sort_order = ${item.sortOrder}
       where code = ${literal(item.code)};`,
    );
    return "~";
  };

  // Print the whole tree in sheet order, marking every row, so the dry
  // run is a reviewable document rather than a count.
  for (const category of SHEET) {
    console.log(`${category.code}`);
    for (const entry of category.entries) {
      if (entry.items) {
        const flat = groups.find((g) => g.code === entry.code)!;
        console.log(`  ${markGroup(flat)} ${entry.code}  [${entry.name}]`);
        for (const item of entry.items) {
          const flatItem = items.find((i) => i.code === item.code)!;
          console.log(`      ${markItem(flatItem)} ${item.code}  ${item.name}`);
        }
      } else {
        const flatItem = items.find((i) => i.code === entry.code)!;
        console.log(`  ${markItem(flatItem)} ${entry.code}  ${entry.name}`);
      }
    }
  }

  console.log(`\n+ ${added} new, ~ ${changed} changed, = ${unchanged} unchanged`);

  if (!commit) {
    console.log("\nDry run — nothing written. Re-run with --commit to apply.");
    return;
  }
  if (statements.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  // One request, one transaction: all of it lands or none of it does.
  await sql(ref, `begin;\n${statements.join("\n")}\ncommit;`);

  const groupCount = await sql<{ n: number }>(ref, "select count(*)::int as n from work_groups");
  const itemCount = await sql<{ n: number }>(ref, "select count(*)::int as n from work_items");
  console.log(
    `\nDone. Database now holds ${groupCount[0].n} groups and ${itemCount[0].n} work items.`,
  );
  console.log("Re-run without --commit: every row should print '='.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
