/**
 * Loads the site team's schedule workbook into Supervisors' schedule (plan.md, piece 2).
 *
 *   npx tsx scripts/import-site-schedule.ts --project <ref> --plots-in "Saarang - Villas" --xlsx "C:/Users/goodearth/Downloads/sched.xlsx"
 *   … the same with --commit
 *
 * --plots-in names the project whose plots the sheets are: plot codes repeat across projects (Baveli has a P2 too).
 *
 * The workbook is .xlsb; save it once as .xlsx (the reader is xlsx-only).
 *  - The sequence: each stage's typical days rolled up from the plots' planned dates, and each curing as the wait after the
 *    stage it cures, set only while the stage after it has no typed days. A stage the workbook has no line for gets 1 day,
 *    marked to fill in. Days someone already typed are kept.
 *  - Each plot sheet's villa: its start date and its supervisor (when one active person's name starts with the sheet's), only
 *    where none is set; its stages done or working from the actual dates up to today, only on a stage nothing has happened on
 *    and not marked not needed.
 * A re-run finds nothing to do. --commit backs the three tables up first.
 */
import { todayInIndia } from "../lib/format";
import {
  plotProgress,
  plotsFromWorkbook,
  sequenceDays,
} from "../lib/supervisors/schedule-workbook";
import { backupTables } from "./backup-tables";
import { readWorkbook } from "./read-xlsx";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(argv);
const xlsxAt = argv.indexOf("--xlsx");
const xlsx = xlsxAt === -1 ? undefined : argv[xlsxAt + 1];
if (!xlsx) throw new Error('Name the workbook: --xlsx "<path>.xlsx"');
const projectAt = argv.indexOf("--plots-in");
const plotsIn = projectAt === -1 ? undefined : argv[projectAt + 1];
if (!plotsIn)
  throw new Error('Name the project the plot sheets belong to: --plots-in "Saarang - Villas"');

const STAND_IN_DAYS = 1;

type SequenceDb = {
  work_group_id: string;
  code: string;
  follows_group_id: string | null;
  link: string;
  wait_days: number;
  typical_days: number | null;
  days_to_confirm: boolean;
};

void (async () => {
  const plots = plotsFromWorkbook(readWorkbook(xlsx));
  if (plots.length === 0) throw new Error(`${xlsx} has no plot sheets (P-2, P-22-23…).`);
  const days = sequenceDays(plots);
  const today = todayInIndia();

  const [sequence, plotRows, villas, stages, people] = await Promise.all([
    sql<SequenceDb>(
      ref,
      `select s.work_group_id, g.code, s.follows_group_id, s.link, s.wait_days, s.typical_days, s.days_to_confirm
         from site_sequence s join work_groups g on g.id = s.work_group_id order by s.position`,
    ),
    sql<{ id: string; code: string | null }>(
      ref,
      `select p.id, p.code from plots p join projects pr on pr.id = p.project_id where pr.name = ${literal(plotsIn)}`,
    ),
    sql<{ plot_id: string; start_on: string | null; supervisor_id: string | null }>(
      ref,
      `select plot_id, start_on, supervisor_id from site_villas`,
    ),
    sql<{
      plot_id: string;
      work_group_id: string;
      status: string;
      started_on: string | null;
      not_needed: boolean;
    }>(ref, `select plot_id, work_group_id, status, started_on, not_needed from site_stages`),
    sql<{ id: string; full_name: string | null }>(
      ref,
      `select id, full_name from profiles where is_active`,
    ),
  ]);
  const groupOfCode = new Map(
    (await sql<{ id: string; code: string }>(ref, `select id, code from work_groups`)).map(
      (group) => [group.code, group.id],
    ),
  );

  console.log(`Database : ${ref}`);
  console.log(`Workbook : ${xlsx} (${plots.length} plots)`);
  console.log(`Plots in : ${plotsIn} (${plotRows.length} plots)`);
  if (plotRows.length === 0) throw new Error(`No project called "${plotsIn}" with plots.`);
  if (days.unknown.length) {
    throw new Error(
      `The workbook has activities the mapping does not know — add them to ACTIVITY_TARGET:\n  ${days.unknown.join("\n  ")}`,
    );
  }

  // 1. The sequence's days.
  const sequenceUpdates: {
    work_group_id: string;
    typical_days: number;
    days_to_confirm: boolean;
  }[] = [];
  const waitUpdates: { work_group_id: string; wait_days: number }[] = [];
  const codeOfGroup = new Map(sequence.map((row) => [row.work_group_id, row.code]));
  for (const row of sequence) {
    const fromWorkbook = days.typicalDays.get(row.code);
    const typed = row.typical_days !== null && !row.days_to_confirm;
    if (fromWorkbook && !typed && row.typical_days !== fromWorkbook) {
      sequenceUpdates.push({
        work_group_id: row.work_group_id,
        typical_days: fromWorkbook,
        days_to_confirm: false,
      });
    } else if (!fromWorkbook && row.typical_days === null) {
      sequenceUpdates.push({
        work_group_id: row.work_group_id,
        typical_days: STAND_IN_DAYS,
        days_to_confirm: true,
      });
    }
    const cured = row.follows_group_id ? codeOfGroup.get(row.follows_group_id) : undefined;
    const wait = cured && row.link === "after" ? days.curingDays.get(cured) : undefined;
    // Once the stage after it has typed days, the sequence is the site team's: a re-run leaves its wait alone.
    const settled = row.typical_days !== null && !row.days_to_confirm;
    if (wait !== undefined && wait !== row.wait_days && !settled) {
      waitUpdates.push({ work_group_id: row.work_group_id, wait_days: wait });
    }
  }
  console.log(
    `\nSequence: ${sequenceUpdates.length} stages get days, ${waitUpdates.length} waits change`,
  );
  for (const update of sequenceUpdates) {
    console.log(
      `  ${codeOfGroup.get(update.work_group_id)}: ${update.typical_days} ${update.days_to_confirm ? "day (stand-in, to fill in)" : "days"}`,
    );
  }
  for (const update of waitUpdates) {
    console.log(`  ${codeOfGroup.get(update.work_group_id)}: wait ${update.wait_days} days`);
  }

  // 2. Each plot's villa and stages.
  const plotOfCode = new Map(
    plotRows.flatMap((plot) => (plot.code ? [[plot.code.toUpperCase(), plot.id] as const] : [])),
  );
  const villaOf = new Map(villas.map((villa) => [villa.plot_id, villa]));
  const stageOf = new Map(
    stages.map((stage) => [`${stage.plot_id}|${stage.work_group_id}`, stage]),
  );
  const villaWrites: { plot_id: string; start_on: string | null; supervisor_id: string | null }[] =
    [];
  const stageWrites: {
    plot_id: string;
    work_group_id: string;
    status: string;
    started_on: string;
    finished_on: string | null;
  }[] = [];
  for (const plot of plots) {
    const plotId = plotOfCode.get(plot.plotCode.toUpperCase());
    if (!plotId) {
      console.log(`\n${plot.sheet}: no plot ${plot.plotCode} in the database — skipped`);
      continue;
    }
    const progress = plotProgress(plot, today);
    const villa = villaOf.get(plotId);
    const name = plot.supervisor?.toLowerCase();
    const matches = name
      ? people.filter((person) => {
          const full = person.full_name?.toLowerCase() ?? "";
          return full === name || full.startsWith(`${name} `);
        })
      : [];
    const supervisorId = !villa?.supervisor_id && matches.length === 1 ? matches[0].id : null;
    const startOn = !villa?.start_on ? progress.startOn : null;
    if (startOn || supervisorId) {
      villaWrites.push({ plot_id: plotId, start_on: startOn, supervisor_id: supervisorId });
    }
    const notes: string[] = [];
    if (startOn) notes.push(`starts ${startOn}`);
    if (supervisorId) notes.push(`run by ${matches[0].full_name}`);
    else if (plot.supervisor && !villa?.supervisor_id) {
      notes.push(
        `supervisor "${plot.supervisor}" ${matches.length ? "matches several people" : "matches nobody"} — left unset`,
      );
    }
    const written: string[] = [];
    const kept: string[] = [];
    const leftOff: string[] = [];
    for (const stage of progress.stages) {
      const groupId = groupOfCode.get(stage.code);
      if (!groupId) continue;
      const existing = stageOf.get(`${plotId}|${groupId}`);
      if (existing?.not_needed) {
        leftOff.push(stage.code);
        continue;
      }
      if (existing && (existing.status !== "not_started" || existing.started_on)) {
        kept.push(stage.code);
        continue;
      }
      stageWrites.push({
        plot_id: plotId,
        work_group_id: groupId,
        status: stage.status,
        started_on: stage.startedOn,
        finished_on: stage.finishedOn,
      });
      written.push(`${stage.code} ${stage.status}`);
    }
    console.log(`\n${plot.sheet} → ${plot.plotCode}: ${notes.join(", ") || "villa already set"}`);
    if (written.length) console.log(`  stages: ${written.join(", ")}`);
    if (kept.length) console.log(`  already recorded, kept: ${kept.join(", ")}`);
    if (leftOff.length) console.log(`  marked not needed, skipped: ${leftOff.join(", ")}`);
  }

  const nothing =
    sequenceUpdates.length + waitUpdates.length + villaWrites.length + stageWrites.length === 0;
  if (!commit) {
    console.log(
      `\nDry run. Nothing was written.${nothing ? "" : " Re-run with --commit to load it."}`,
    );
    return;
  }
  if (nothing) {
    console.log("\nNothing to do.");
    return;
  }

  const backup = await backupTables(ref, "site-schedule", [
    "site_sequence",
    "site_villas",
    "site_stages",
  ]);
  console.log(`\nBacked up to ${backup}`);
  const json = (value: unknown) => `${literal(JSON.stringify(value))}::jsonb`;
  await sql(
    ref,
    `begin;
     update site_sequence s set typical_days = u.typical_days, days_to_confirm = u.days_to_confirm, updated_at = now()
       from jsonb_to_recordset(${json(sequenceUpdates)}) as u(work_group_id uuid, typical_days int, days_to_confirm boolean)
      where s.work_group_id = u.work_group_id;
     update site_sequence s set wait_days = u.wait_days, updated_at = now()
       from jsonb_to_recordset(${json(waitUpdates)}) as u(work_group_id uuid, wait_days int)
      where s.work_group_id = u.work_group_id;
     insert into site_villas (plot_id, start_on, supervisor_id)
     select plot_id, start_on, supervisor_id
       from jsonb_to_recordset(${json(villaWrites)}) as v(plot_id uuid, start_on date, supervisor_id uuid)
     on conflict (plot_id) do update
       set start_on = coalesce(site_villas.start_on, excluded.start_on),
           supervisor_id = coalesce(site_villas.supervisor_id, excluded.supervisor_id);
     insert into site_stages (plot_id, work_group_id, status, started_on, finished_on)
     select plot_id, work_group_id, status, started_on, finished_on
       from jsonb_to_recordset(${json(stageWrites)})
         as w(plot_id uuid, work_group_id uuid, status text, started_on date, finished_on date)
     on conflict (plot_id, work_group_id) do update
       set status = excluded.status, started_on = excluded.started_on, finished_on = excluded.finished_on
       where site_stages.status = 'not_started' and site_stages.started_on is null and not site_stages.not_needed;
     commit;`,
  );
  console.log(
    `Done. ${sequenceUpdates.length} stage days, ${waitUpdates.length} waits, ${villaWrites.length} villas, ${stageWrites.length} stages.`,
  );
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
