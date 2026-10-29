/**
 * Adds to the rate book, once, what Goodearth QS's recipes.csv has and the toolbox lacks (plan.md, From the model,
 * everything, piece 2; the founder, 2026-10-29: "add once, from the plugin" — from then on they are the toolbox's).
 *
 *   npx tsx scripts/seed-sketchup-mixes.ts --project <ref> --csv <recipes.csv>            # dry run: says what it would do
 *   npx tsx scripts/seed-sketchup-mixes.ts --project <ref> --csv <recipes.csv> --commit
 *
 * - Each mix, steel bar size (`Steel d mm`, `Steel (kg per cum)`, binding wire in each) and extra the toolbox has no mix
 *   of that name for becomes a mix under From SketchUp with its make-up. A From SketchUp mix an import already made
 *   empty is filled in. A mix the toolbox already had is never touched.
 * - With --works, a work's recipe too, only where the rate book has none for it and the unit agrees.
 * - An item code Masters lacks is skipped and named. One transaction; a second run adds nothing.
 */
import { readFileSync } from "node:fs";

import { steelMixName } from "../lib/estimator/model-takeoff";
import { isCommit, requireProjectRef, sql } from "./supabase-management";

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(argv);
/** Work recipes change the rate book for every villa using those works, so they go in only when asked for. */
const withWorks = argv.includes("--works");
const at = argv.indexOf("--csv");
if (at === -1 || !argv[at + 1])
  throw new Error("--csv <recipes.csv> is required: Goodearth QS's own recipes.");

/** RFC 4180 enough for recipes.csv: commas, quotes, doubled quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const [header, ...body] = parseCsv(readFileSync(argv[at + 1], "utf8").replace(/^﻿/, ""));
const col = (name: string) => {
  const index = header.indexOf(name);
  if (index === -1) throw new Error(`recipes.csv has no ${name} column.`);
  return index;
};
const [KIND, NAME, PER, MATERIAL, QTY] = ["kind", "name", "per", "material", "qty"].map(col);

type Part = { owner: string; uom: string; item: string; qty: number };
const mixParts: Part[] = [];
const workParts: Part[] = [];
let bindingWire: { item: string; qty: number } | null = null;
for (const cells of body) {
  const kind = cells[KIND].trim();
  const name = cells[NAME].trim();
  const part = { uom: cells[PER].trim(), item: cells[MATERIAL].trim(), qty: Number(cells[QTY]) };
  if (!Number.isFinite(part.qty) || part.qty <= 0 || !part.item) continue;
  if (kind === "mix" || kind === "extra") mixParts.push({ owner: name, ...part });
  else if (kind === "steel" && name === "all") bindingWire = { item: part.item, qty: part.qty };
  else if (kind === "steel" && /^\d{1,2}$/.test(name))
    mixParts.push({ owner: steelMixName(name), ...part });
  else if (kind === "work" && withWorks) workParts.push({ owner: name, ...part });
}
if (bindingWire) {
  for (const steel of [
    ...new Set(mixParts.filter((p) => p.owner.startsWith("Steel")).map((p) => p.owner)),
  ]) {
    mixParts.push({ owner: steel, uom: "kg", ...bindingWire });
  }
}

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const values = (parts: Part[]) =>
  parts
    .map((p) => `(${literal(p.owner)}, ${literal(p.uom)}, ${literal(p.item)}, ${p.qty})`)
    .join(",\n  ");

const statements = String.raw`
create temp table seed_mix (name text, uom text, item text, qty numeric) on commit drop;
insert into seed_mix values
  ${values(mixParts)};
create temp table seed_work (code text, uom text, item text, qty numeric) on commit drop;
${workParts.length > 0 ? `insert into seed_work values ${values(workParts)};` : ""}
create temp table seed_report (line text) on commit drop;

insert into seed_report
select 'Skipped, not in Masters: ' || string_agg(distinct s.item, ', ')
from (select item from seed_mix union select item from seed_work) s
where not exists (select 1 from items i where i.code = s.item)
having count(*) > 0;

insert into seed_report
select 'Skipped, a unit the toolbox lacks: ' || string_agg(distinct s.name || ' (' || s.uom || ')', ', ')
from seed_mix s
where not exists (select 1 from uoms u where lower(u.name) = lower(s.uom))
having count(*) > 0;

with made as (
  insert into estimator_mixes (name, uom, group_name, description)
  select distinct on (lower(s.name)) s.name, u.name, 'From SketchUp', 'From Goodearth QS''s recipes (2026-10-29).'
  from seed_mix s
  join uoms u on lower(u.name) = lower(s.uom)
  where not exists (select 1 from estimator_mixes x where lower(x.name) = lower(s.name))
  order by lower(s.name), u.name
  on conflict ((lower(name))) do nothing
  returning name
)
insert into seed_report select 'New mixes: ' || string_agg(name, ', ' order by name) from made having count(*) > 0;

with filled as (
  insert into estimator_mix_components (mix_id, item_id, qty_per_unit)
  select x.id, i.id, sum(s.qty)
  from seed_mix s
  join estimator_mixes x on lower(x.name) = lower(s.name) and x.group_name = 'From SketchUp'
  join items i on i.code = s.item
  where not exists (select 1 from estimator_mix_components c where c.mix_id = x.id)
  group by x.id, i.id
  returning mix_id
)
insert into seed_report
select 'Mixes given their make-up: ' || string_agg(distinct x.name, ', ')
from filled f join estimator_mixes x on x.id = f.mix_id having count(*) > 0;

insert into seed_report
select 'Work recipes skipped, the unit differs from the rate book: '
       || string_agg(distinct s.code || ' (' || s.uom || ' here, ' || i.uom || ' there)', ', ')
from seed_work s
join work_items w on w.code = s.code
join estimator_work_info i on i.work_item_id = w.id
where lower(i.uom) <> lower(s.uom)
having count(*) > 0;

with given as (
  insert into estimator_work_components (work_item_id, item_id, qty_per_unit)
  select w.id, it.id, sum(s.qty)
  from seed_work s
  join work_items w on w.code = s.code and w.is_active
  join estimator_work_info i on i.work_item_id = w.id and lower(i.uom) = lower(s.uom)
  join items it on it.code = s.item
  where not exists (select 1 from estimator_work_components c where c.work_item_id = w.id)
  group by w.id, it.id
  returning work_item_id
)
insert into seed_report
select 'Works given a recipe (the rate book had none): ' || string_agg(distinct w.code, ', ')
from given g join work_items w on w.id = g.work_item_id having count(*) > 0;
`;

const report = String.raw`(select coalesce(string_agg(line, ' | '), 'Nothing to add: the rate book has it all.') from seed_report)`;

async function dryRun(): Promise<boolean> {
  try {
    await sql(
      ref,
      [
        "begin;",
        statements,
        `do $dry$ begin raise exception 'DRY RUN, nothing kept: %', ${report}; end $dry$;`,
        "rollback;",
      ].join("\n"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const found = message.indexOf("DRY RUN");
    console.log(found === -1 ? message : message.slice(found).split(" | ").join("\n  "));
    return found !== -1;
  }
  return false;
}

// tsx runs scripts as CommonJS here, so no top-level await. A commit shows the dry run's report first.
void (async () => {
  if (!(await dryRun())) process.exit(1);
  if (!commit) return;
  await sql(ref, ["begin;", statements, "commit;"].join("\n"));
  console.log("Committed, as above.");
})();
