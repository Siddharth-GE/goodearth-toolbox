/**
 * Loads the operations team's site checklists into Supervisors' templates (0134), once.
 *
 *   npx tsx scripts/import-checklists.ts --project <ref> --xlsx "C:/Users/goodearth/Documents/Tb/3.xlsx"            # dry run
 *   npx tsx scripts/import-checklists.ts --project <ref> --xlsx "C:/Users/goodearth/Documents/Tb/3.xlsx" --commit
 *
 * The workbook is the old .xls format; save it once as .xlsx (the reader is xlsx-only).
 * A template matches by name and an item by its template and number, so a re-run adds only what is
 * missing and never touches what Supervisors → Checklists has since edited.
 */
import { readWorkbook } from "./read-xlsx";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";
import { readChecklistWorkbook } from "../lib/supervisors/checklist-workbook";

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(argv);
const xlsxAt = argv.indexOf("--xlsx");
const xlsx = xlsxAt === -1 ? undefined : argv[xlsxAt + 1];
if (!xlsx) throw new Error('Name the workbook: --xlsx "<path>.xlsx"');

const templates = readChecklistWorkbook(readWorkbook(xlsx));
if (templates.length === 0) throw new Error(`${xlsx} has no checklist sheets.`);

const payload = literal(
  JSON.stringify(
    templates.map((template) => ({
      name: template.name,
      work_refs: template.workRefs,
      note: template.note,
      sort_order: template.sortOrder,
      items: template.items.map((item) => ({
        sort_order: item.sortOrder,
        text: item.text,
        origin: item.origin,
        review_note: item.reviewNote,
      })),
    })),
  ),
);

const source = `
  src as (
    select * from jsonb_to_recordset(${payload}::jsonb)
      as s(name text, work_refs text, note text, sort_order int, items jsonb)
  ),
  src_items as (
    select s.name, i.sort_order, i.text, i.origin, i.review_note
    from src s
    cross join lateral jsonb_to_recordset(s.items)
      as i(sort_order int, text text, origin text, review_note text)
  )`;

const missingQuery = `
  with ${source}
  select
    (select count(*) from src s
      where not exists (select 1 from checklist_templates t where t.name = s.name))::int as templates,
    (select count(*) from src_items i
      where not exists (
        select 1 from checklist_template_items x
        join checklist_templates t on t.id = x.template_id
        where t.name = i.name and x.sort_order = i.sort_order
      ))::int as items`;

void (async () => {
  console.log(`Database : ${ref}`);
  console.log(`Workbook : ${xlsx}`);
  for (const template of templates) {
    console.log(`  ${template.name}: ${template.items.length} items`);
  }

  const [missing] = await sql<{ templates: number; items: number }>(ref, missingQuery);
  console.log(`To add   : ${missing.templates} templates, ${missing.items} items`);
  if (!commit) {
    console.log("Dry run. Nothing was written. Re-run with --commit to load them.");
    return;
  }
  if (missing.templates === 0 && missing.items === 0) {
    console.log("Nothing to add.");
    return;
  }

  await sql(
    ref,
    `begin;
     with ${source}
     insert into checklist_templates (name, work_refs, note, sort_order)
     select name, work_refs, note, sort_order from src
     on conflict (name) do nothing;

     with ${source}
     insert into checklist_template_items (template_id, sort_order, text, origin, review_note)
     select t.id, i.sort_order, i.text, i.origin, i.review_note
     from src_items i
     join checklist_templates t on t.name = i.name
     where not exists (
       select 1 from checklist_template_items x
       where x.template_id = t.id and x.sort_order = i.sort_order
     );
     commit;`,
  );

  const [left] = await sql<{ templates: number; items: number }>(ref, missingQuery);
  if (left.templates !== 0 || left.items !== 0) {
    throw new Error(
      `Loaded, but ${left.templates} templates and ${left.items} items are still missing.`,
    );
  }
  console.log(`Done. Added ${missing.templates} templates and ${missing.items} items.`);
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
