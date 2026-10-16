/**
 * Brings the self-hosted Saarang Tracker's data into Client Relations,
 * once — its plots' paperwork, build stage, Kaadal and design checks, and
 * every action (root plan.md, seventh piece; 0119, 0120).
 *
 *   npx tsx scripts/import-saarang-tracker.ts --project <ref> --json data/saarang-tracker-<date>.json            # dry run
 *   npx tsx scripts/import-saarang-tracker.ts --project <ref> --json data/saarang-tracker-<date>.json --commit   # write
 *   … --print <file.sql>   writes the batch (ending in a dry-run abort) for scripts/dry-run-migrations.ts --trial
 *
 * The export is the tracker's own `/api/export` (a manager's download) or
 * its `data.json`. It names clients and their circumstances, so it lives
 * in /data, which git ignores — never commit it.
 *
 * ONE TRANSACTION, the import-birdwing shape: the data rides in as JSON,
 * set-based statements place it, an assertion block proves every action
 * landed, and a dry run sends the same batch and aborts it at the end.
 *
 * WHAT IT DECIDES
 *
 *   * A plot matches by number: "Plot 22-23" is Masters' P22-23. Phase 3's
 *     "P3 …" units, and any plot Masters does not have, match nothing.
 *   * IT FILLS BLANKS AND NEVER OVERWRITES. A field Client Relations
 *     already holds keeps its value; a deed or CA status counts as blank
 *     while it is the default 'not_signed'.
 *   * MASTERS IS NEVER WRITTEN. Where the tracker and Masters disagree on
 *     who holds a plot, the plot's fields are left alone and the plot is
 *     listed for the founder. Its actions still land on it — they are
 *     about the plot, whoever holds it.
 *   * An action on a plot Masters does not have lands with no plot, the
 *     tracker's plot named in its notes, so no promise is dropped.
 *   * The build stage matches Masters' build progress by name; "Not
 *     started" is none. A "Yes" design check is stamped with the plot's
 *     last-updated day in the tracker — the only date it has. The
 *     tracker's plot-payment word goes into the plot's details beside its
 *     notes, because Client Relations works payment out from receipts.
 *   * The tracker's "Fix first" list is not imported: every item on it is
 *     resolved. Nor is its audit log.
 *
 * RE-RUNNABLE. Each action's id is derived from its tracker id
 * (md5('saarang-tracker:<id>')), so a second run inserts nothing; the
 * plots' fill-blank updates change nothing the second time.
 *
 * Service-level access through the management API (scripts only).
 */
import { readFileSync, writeFileSync } from "node:fs";

import { isCommit, requireProjectRef, sql } from "./supabase-management";

type Deal = {
  id: string;
  label: string;
  phase: string;
  client: string;
  owner: string;
  kaadalOwner: string;
  saleDeed: string;
  sdWith: string;
  sdAck: string;
  ca: string;
  caWith: string;
  caAck: string;
  payment: string;
  bottleneck: string;
  stage: string;
  kaadal: string;
  kaadalNote: string;
  notes: string;
  design: string;
  permit: string;
  working: string;
  plotDue: string;
  lastUpdated: string;
};

type Action = {
  id: string;
  action: string;
  owner: string;
  deal: string;
  due: string;
  dueAssumed?: boolean;
  status: string;
  track: string;
  notes: string;
  loggedOn: string;
  doneOn: string;
  updatedAt?: string;
};

type Export = { deals: Record<string, Deal>; actions: Record<string, Action> };

/** The tracker's own team list (its server.js USERS). */
const PEOPLE: Record<string, string> = {
  Anu: "anu@goodearthkannur.org",
  Sayooj: "sayooj@goodearthkannur.org",
  Sebastina: "sebastina@goodearthkannur.org",
};

const SIGNED: Record<string, string> = {
  "Not started": "not_started",
  Drafting: "drafting",
  "Not signed": "not_signed",
  Signed: "signed",
};
const CUSTODY: Record<string, string> = {
  Client: "client",
  Bank: "bank",
  "Chess Cafe": "chess_cafe",
  Sreejayan: "sreejayan",
  Tarana: "tarana",
};
const ACK: Record<string, string> = {
  Received: "received",
  "With bank": "with_bank",
  "With Sreejayan": "with_sreejayan",
  "Requested from client": "requested_from_client",
  Pending: "pending",
};
const BOTTLENECK: Record<string, string> = {
  Payments: "payments",
  Design: "design",
  "Interior design": "interiors",
  Client: "client",
  Management: "management",
  "Legal / documents": "legal",
  "Bank / loan": "bank_loan",
};
const KAADAL: Record<string, string> = {
  "To pitch": "to_pitch",
  "Pitch done": "pitch_done",
  "Retainer pending": "retainer_pending",
  "Retainer paid": "retainer_paid",
  "In design": "in_design",
  Execution: "execution",
  "Closed – no interiors": "closed",
};
const STATUS: Record<string, string> = {
  Open: "open",
  "Waiting on client": "waiting_client",
  "Waiting on management": "waiting_management",
  Done: "done",
};
const TRACK: Record<string, string> = { Sales: "sales", Kaadal: "kaadal" };

/** "Plot 01" → "P1", "Plot 22-23" → "P22-23"; Phase 3 and anything else → null. */
function plotCode(label: string): string | null {
  const match = /^Plot\s+(\d+(?:-\d+)?)$/.exec(label.trim());
  if (!match) return null;
  return (
    "P" +
    match[1]
      .split("-")
      .map((n) => String(Number(n)))
      .join("-")
  );
}

/** Names compared the way a person reads them: case, titles, "&" and spacing aside. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/\b(mr|mrs|ms|dr)\.?\s/g, " ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

const isDate = (s: string | undefined) => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s));

function pick<T extends string>(
  map: Record<string, T>,
  value: string,
  what: string,
  problems: string[],
) {
  if (!value || value === "None") return null;
  const mapped = map[value];
  if (!mapped) problems.push(`unknown ${what} "${value}"`);
  return mapped ?? null;
}

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(process.argv);
const jsonAt = argv.indexOf("--json");
if (jsonAt === -1 || !argv[jsonAt + 1]) throw new Error("--json <export.json> is required.");
const printAt = argv.indexOf("--print");
const printTo = printAt === -1 ? null : argv[printAt + 1];

const source = JSON.parse(readFileSync(argv[jsonAt + 1], "utf8")) as Export;
if (!source.deals || !source.actions) throw new Error("That file is not a tracker export.");

void (async () => {
  try {
    const plots = await sql<{ engagement_id: string; code: string | null; client: string | null }>(
      ref,
      `select e.id as engagement_id, p.code, c.name as client
         from client_engagements e
         join units u on u.id = e.unit_id
         join plots p on p.id = u.plot_id
         join projects pr on pr.id = e.project_id
         left join clients c on c.id = u.client_id
        where pr.name = 'Saarang - Villas'`,
    );
    const people = await sql<{ id: string; email: string; on_team: boolean }>(
      ref,
      `select p.id, u.email,
              p.role = 'admin'
              or exists (select 1 from user_apps a where a.user_id = p.id and a.app = '/client-relations')
              or exists (select 1 from role_apps r where r.role_id = p.role_id and r.app = '/client-relations')
              as on_team
         from profiles p join auth.users u on u.id = p.id
        where p.is_active`,
    );

    const byCode = new Map(plots.map((plot) => [plot.code, plot]));
    const byEmail = new Map(people.map((person) => [person.email.toLowerCase(), person]));
    const personId = (name: string): string | null =>
      name && PEOPLE[name] ? (byEmail.get(PEOPLE[name])?.id ?? null) : null;

    const differences: string[] = [];
    const notInMasters: string[] = [];
    const engagementOf = new Map<string, string>();
    const plotRows: Record<string, unknown>[] = [];

    for (const deal of Object.values(source.deals)) {
      const code = plotCode(deal.label);
      const plot = code ? byCode.get(code) : undefined;
      if (!plot) {
        notInMasters.push(deal.label);
        continue;
      }
      engagementOf.set(deal.id, plot.engagement_id);

      const trackerClient = deal.client && deal.client !== "Available" ? deal.client : null;
      if ((trackerClient ?? "") !== "" || plot.client) {
        if (!trackerClient || !plot.client || !sameName(trackerClient, plot.client)) {
          differences.push(
            `${deal.label}: ${
              !plot.client
                ? "Masters has no buyer; the tracker names one"
                : !trackerClient
                  ? "Masters names a buyer; the tracker says available"
                  : "Masters and the tracker name different buyers"
            } — fields left alone`,
          );
          continue;
        }
      }

      const problems: string[] = [];
      const yesOn = (flag: string) =>
        flag === "Yes" && isDate(deal.lastUpdated) ? deal.lastUpdated : null;
      const details = [
        deal.notes?.trim(),
        deal.payment ? `Plot payment (Saarang tracker): ${deal.payment}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      plotRows.push({
        engagement_id: plot.engagement_id,
        owner_id: personId(deal.owner),
        kaadal_owner_id: personId(deal.kaadalOwner),
        sale_deed_status: pick(SIGNED, deal.saleDeed, "sale deed status", problems),
        sd_with: pick(CUSTODY, deal.sdWith, "custodian", problems),
        sd_ack: pick(ACK, deal.sdAck, "acknowledgement", problems),
        ca_status: pick(SIGNED, deal.ca, "CA status", problems),
        ca_with: pick(CUSTODY, deal.caWith, "custodian", problems),
        ca_ack: pick(ACK, deal.caAck, "acknowledgement", problems),
        bottleneck: pick(BOTTLENECK, deal.bottleneck, "bottleneck", problems),
        stage: deal.stage && deal.stage !== "Not started" ? deal.stage : null,
        kaadal_stage: pick(KAADAL, deal.kaadal, "Kaadal stage", problems),
        kaadal_note: deal.kaadalNote?.trim().slice(0, 500) || null,
        details: details || null,
        design_on: yesOn(deal.design),
        permit_on: yesOn(deal.permit),
        working_on: yesOn(deal.working),
        plot_due: isDate(deal.plotDue) ? deal.plotDue : null,
      });
      for (const problem of problems) differences.push(`${deal.label}: ${problem} — left blank`);
    }

    const actionRows: Record<string, unknown>[] = [];
    const ownersOffTeam = new Set<string>();
    for (const action of Object.values(source.actions)) {
      const ownerId = personId(action.owner);
      if (!ownerId)
        throw new Error(`Action ${action.id}: "${action.owner}" has no active account.`);
      if (!people.find((p) => p.id === ownerId)?.on_team) ownersOffTeam.add(action.owner);
      const engagementId = engagementOf.get(action.deal) ?? null;
      const trackerPlot = source.deals[action.deal]?.label ?? action.deal;
      const notes = [
        !engagementId && action.deal ? `Tracker plot: ${trackerPlot}` : "",
        action.notes?.trim() ?? "",
      ]
        .filter(Boolean)
        .join("\n");
      const status = STATUS[action.status];
      if (!status) throw new Error(`Action ${action.id}: unknown status "${action.status}".`);
      const due = isDate(action.due) ? action.due : null;
      actionRows.push({
        key: `saarang-tracker:${action.id}`,
        engagement_id: engagementId,
        action: action.action.trim().slice(0, 500),
        owner_id: ownerId,
        due_on: due,
        due_assumed: Boolean(action.dueAssumed && due),
        status,
        track: TRACK[action.track] ?? "sales",
        notes: notes.slice(0, 4000) || null,
        done_on:
          status === "done" ? (isDate(action.doneOn) ? action.doneOn : action.loggedOn) : null,
        created_at: isDate(action.loggedOn) ? `${action.loggedOn}T09:00:00+05:30` : null,
        updated_at: action.updatedAt ?? null,
      });
    }

    const payload = JSON.stringify({ plots: plotRows, actions: actionRows });
    if (payload.includes("$json$"))
      throw new Error("The export contains the batch's quote marker.");

    const batch = `
do $import$
declare
  doc jsonb := $json$${payload}$json$::jsonb;
  missing int;
begin
  -- 1. Statuses first: a default 'not_signed' counts as blank.
  update client_engagements e set
      sale_deed_status = case when e.sale_deed_status = 'not_signed' and x.sale_deed_status is not null
                              then x.sale_deed_status else e.sale_deed_status end,
      ca_status = case when e.ca_status = 'not_signed' and x.ca_status is not null
                       then x.ca_status else e.ca_status end
    from jsonb_to_recordset(doc->'plots') as x(engagement_id uuid, sale_deed_status text, ca_status text)
   where e.id = x.engagement_id;

  -- 2. Everything else fills a blank and nothing more. A custodian only on
  --    a signed document (0050).
  update client_engagements e set
      crm_owner_id = coalesce(e.crm_owner_id, x.owner_id),
      kaadal_owner_id = coalesce(e.kaadal_owner_id, x.kaadal_owner_id),
      sale_deed_original_with = case when e.sale_deed_original_with is null and e.sale_deed_status = 'signed'
                                     then x.sd_with else e.sale_deed_original_with end,
      sale_deed_ack = coalesce(e.sale_deed_ack, x.sd_ack),
      ca_original_with = case when e.ca_original_with is null and e.ca_status = 'signed'
                              then x.ca_with else e.ca_original_with end,
      ca_ack = coalesce(e.ca_ack, x.ca_ack),
      bottlenecks = case when cardinality(e.bottlenecks) = 0 and x.bottleneck is not null
                         then array[x.bottleneck] else e.bottlenecks end,
      progress_stage_id = coalesce(e.progress_stage_id,
        (select s.id from progress_stages s where lower(trim(s.name)) = lower(trim(x.stage)))),
      kaadal_stage = coalesce(e.kaadal_stage, x.kaadal_stage),
      kaadal_note = coalesce(e.kaadal_note, x.kaadal_note),
      details = coalesce(e.details, x.details),
      design_confirmed_on = coalesce(e.design_confirmed_on, x.design_on),
      permit_on = coalesce(e.permit_on, x.permit_on),
      working_drawing_on = coalesce(e.working_drawing_on, x.working_on)
    from jsonb_to_recordset(doc->'plots') as x(
      engagement_id uuid, owner_id uuid, kaadal_owner_id uuid, sd_with text, sd_ack text,
      ca_with text, ca_ack text, bottleneck text, stage text, kaadal_stage text,
      kaadal_note text, details text, design_on date, permit_on date, working_on date)
   where e.id = x.engagement_id;

  -- 3. The plot amount's due date, on the schedule's 'plot' rung.
  update client_payment_milestones m set due_on = x.plot_due
    from jsonb_to_recordset(doc->'plots') as x(engagement_id uuid, plot_due date)
   where m.engagement_id = x.engagement_id and m.stage = 'plot'
     and m.due_on is null and x.plot_due is not null;

  -- 4. Every action, keyed to its tracker id.
  insert into client_actions (
      id, engagement_id, action, owner_id, due_on, due_assumed, status, track, notes, done_on,
      created_at, updated_at)
  select md5(x.key)::uuid, x.engagement_id, x.action, x.owner_id, x.due_on, x.due_assumed,
         x.status, x.track, x.notes, x.done_on,
         coalesce(x.created_at, now()), coalesce(x.updated_at, x.created_at, now())
    from jsonb_to_recordset(doc->'actions') as x(
      key text, engagement_id uuid, action text, owner_id uuid, due_on date, due_assumed boolean,
      status text, track text, notes text, done_on date, created_at timestamptz, updated_at timestamptz)
  on conflict (id) do nothing;

  select count(*) into missing
    from jsonb_to_recordset(doc->'actions') as x(key text)
   where not exists (select 1 from client_actions a where a.id = md5(x.key)::uuid);
  if missing > 0 then raise exception 'IMPORT: % actions did not land', missing; end if;
end $import$;
`;
    const ending = commit
      ? ""
      : "do $dry$ begin raise exception 'IMPORT DRY RUN COMPLETE — rolled back'; end $dry$;";

    console.log(
      `Plots matched: ${plotRows.length} to fill, ${differences.length} differences, ${notInMasters.length} not in Masters.`,
    );
    console.log(
      `Actions: ${actionRows.length} (${actionRows.filter((a) => !a.engagement_id).length} with no plot).`,
    );
    if (differences.length) console.log("\nFor the founder:\n  " + differences.join("\n  "));
    if (notInMasters.length)
      console.log(`\nNot in Masters (their actions land with no plot): ${notInMasters.join(", ")}`);
    if (ownersOffTeam.size) {
      console.log(
        `\nNot holding /client-relations yet: ${[...ownersOffTeam].join(", ")} — grant it in Settings, or they cannot see their actions.`,
      );
    }

    if (printTo) {
      writeFileSync(
        printTo,
        batch +
          "\n" +
          "do $dry$ begin raise exception 'IMPORT DRY RUN COMPLETE — rolled back'; end $dry$;\n",
      );
      console.log(`\nWrote the batch to ${printTo}.`);
      return;
    }

    await sql(ref, `begin;\n${batch}\n${ending}\n${commit ? "commit;" : ""}`);
    if (!commit) {
      console.log("UNEXPECTED: the dry run did not abort. Check the database at once.");
      process.exit(1);
    }
    console.log("\nCommitted. Open Client Relations → Actions on that database.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!commit && /IMPORT DRY RUN COMPLETE/.test(message)) {
      console.log(
        "\nDry run OK — every update and insert ran against the live schema; nothing was kept.",
      );
      console.log("Re-run with --commit to write.");
      return;
    }
    console.error(message);
    process.exit(1);
  }
})();
