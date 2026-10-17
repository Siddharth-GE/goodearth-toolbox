/**
 * Brings Masters' Saarang register in line with the Saarang Tracker, once. Run it BEFORE
 * scripts/import-saarang-tracker.ts so every plot it names exists.
 *
 *   npx tsx scripts/update-saarang-register.ts --project <ref> --json data/saarang-tracker-<date>.json            # dry run
 *   npx tsx scripts/update-saarang-register.ts --project <ref> --json data/saarang-tracker-<date>.json --commit
 *
 * In one transaction:
 *   1. A pair sold as one deal ("Plot 33-34") that Masters holds as two plots becomes ONE:
 *      the first is renamed; the second, its villa and its empty Client Relations record go.
 *      Refused (FKs roll back) if the second has a buyer or anything recorded.
 *   2. A buyer Masters holds and the tracker does not is RELEASED: villa back to available,
 *      buyer marked lost with the reason. Refused where the record holds money or signed
 *      papers: settle those in Client Relations first.
 *   3. Saarang West's plots are added (codes W1..W29, pairs W21-22 and W23-24), one villa
 *      each with its configuration in the name, because a unit's type is only
 *      villa/apartment/duplex. A new villa gets its record (0050's trigger).
 *   4. A buyer the tracker names and Masters does not is ASSIGNED (client found by name or
 *      created), and the villa and plot marked sold.
 * Masters' placeholder in Saarang West ("Unit 1", no villa) is left alone. Re-runnable.
 */
import { readFileSync } from "node:fs";

import {
  SAARANG,
  SAARANG_WEST,
  TRACKER_PEOPLE,
  configuration,
  sameName,
  trackerBuyer,
  trackerPlot,
  type TrackerPlot,
} from "../lib/client-relations/saarang-tracker";
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

type Deal = {
  id: string;
  label: string;
  client: string;
  owner: string;
  type: string;
  lastUpdated: string;
};

const argv = process.argv.slice(2);
const ref = requireProjectRef(process.argv);
const commit = isCommit(process.argv);
const jsonAt = argv.indexOf("--json");
if (jsonAt === -1 || !argv[jsonAt + 1]) throw new Error("--json <export.json> is required.");
const source = JSON.parse(readFileSync(argv[jsonAt + 1], "utf8")) as {
  deals: Record<string, Deal>;
};
if (!source.deals) throw new Error("That file is not a tracker export.");

const q = (value: string | null) => (value === null ? "null" : literal(value));

const exportDay = Object.values(source.deals)
  .map((deal) => deal.lastUpdated)
  .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day ?? ""))
  .sort()
  .at(-1);
const exportDayText = exportDay
  ? new Date(`${exportDay}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
  : "its export";

type PlotRow = {
  project: string;
  code: string | null;
  name: string;
  client_id: string | null;
  client: string | null;
  holds: boolean;
};

void (async () => {
  try {
    const projects = await sql<{ id: string; name: string }>(
      ref,
      `select id, name from projects where name in (${literal(SAARANG)}, ${literal(SAARANG_WEST)})`,
    );
    const projectId = new Map(projects.map((p) => [p.name, p.id]));
    for (const name of [SAARANG, SAARANG_WEST]) {
      if (!projectId.get(name)) throw new Error(`Masters has no project called "${name}".`);
    }

    const plots = await sql<PlotRow>(
      ref,
      `select pr.name as project, p.code, p.name, u.client_id, c.name as client,
              (exists (select 1 from client_receipts r where r.engagement_id = e.id)
               or exists (select 1 from client_payment_milestones m
                           where m.engagement_id = e.id and (m.due_amount is not null or m.invoiced_on is not null))
               or e.sale_deed_status = 'signed' or e.ca_status = 'signed') as holds
         from plots p
         join projects pr on pr.id = p.project_id
         left join units u on u.plot_id = p.id
         left join clients c on c.id = u.client_id
         left join client_engagements e on e.unit_id = u.id
        where pr.name in (${literal(SAARANG)}, ${literal(SAARANG_WEST)})`,
    );
    const clients = await sql<{ id: string; name: string; stage: string }>(
      ref,
      `select id, name, stage from clients`,
    );
    const people = await sql<{ id: string; email: string }>(
      ref,
      `select p.id, u.email from profiles p join auth.users u on u.id = p.id where p.is_active`,
    );
    const ownerOf = (name: string) => {
      const email = TRACKER_PEOPLE[name];
      return email ? (people.find((p) => p.email.toLowerCase() === email)?.id ?? null) : null;
    };

    const key = (project: string, code: string) => `${project}|${code}`;
    const masters = new Map(plots.filter((p) => p.code).map((p) => [key(p.project, p.code!), p]));

    const statements: string[] = [];
    const report: string[] = [];
    const blocked: string[] = [];
    const released = new Map<string, { name: string; plots: string[] }>();
    const created = new Map<string, string>(); // buyer name → plpgsql variable
    let variables = 0;
    let westAdded = 0;

    const deals = Object.values(source.deals)
      .map((deal) => ({ deal, plot: trackerPlot(deal.label) }))
      .filter((row): row is { deal: Deal; plot: TrackerPlot } => row.plot !== null);

    for (const { plot } of deals) {
      if (plot.project !== SAARANG || plot.numbers.length !== 2) continue;
      if (masters.has(key(SAARANG, plot.code))) continue;
      const first = masters.get(key(SAARANG, `P${plot.numbers[0]}`));
      const second = masters.get(key(SAARANG, `P${plot.numbers[1]}`));
      if (!first || !second) {
        blocked.push(`${plot.name}: Masters has neither the pair nor both plots`);
        continue;
      }
      if (second.client) {
        blocked.push(`${plot.name}: plot ${plot.numbers[1]} has a buyer of its own in Masters`);
        continue;
      }
      statements.push(`
  -- ${plot.name}: one plot, one villa, as the tracker sells it.
  select id into v_keep from plots where project_id = ${q(projectId.get(SAARANG)!)} and code = ${q(first.code)};
  select id into v_drop from plots where project_id = ${q(projectId.get(SAARANG)!)} and code = ${q(second.code)};
  delete from client_engagements where unit_id in (select id from units where plot_id = v_drop);
  delete from units where plot_id = v_drop;
  delete from plots where id = v_drop;
  update plots set code = ${q(plot.code)}, name = ${q(plot.name)} where id = v_keep;`);
      masters.delete(key(SAARANG, second.code!));
      masters.delete(key(SAARANG, first.code!));
      masters.set(key(SAARANG, plot.code), { ...first, code: plot.code, name: plot.name });
      report.push(`Combine ${first.name} and ${second.name} into ${plot.name}`);
    }

    // 2. Buyers who cancelled; 3. Saarang West's plots; 4. new buyers.
    const assigns: string[] = [];
    for (const { deal, plot } of deals) {
      const buyer = trackerBuyer(deal.client);
      let row = masters.get(key(plot.project, plot.code));

      if (!row && plot.project === SAARANG_WEST) {
        const config = configuration(deal.type);
        const unitName = `Villa ${plot.numbers[0]}${config ? ` (${config})` : ""}`;
        const status = buyer ? "sold" : "available";
        statements.push(`
  insert into plots (project_id, code, name, status)
  values (${q(projectId.get(SAARANG_WEST)!)}, ${q(plot.code)}, ${q(plot.name)}, ${q(status)})
  returning id into v_plot;
  insert into units (project_id, plot_id, code, name, unit_type, status)
  values (${q(projectId.get(SAARANG_WEST)!)}, v_plot, ${q(`V${plot.numbers[0]}`)}, ${q(unitName)}, 'villa', ${q(status)});`);
        row = {
          project: SAARANG_WEST,
          code: plot.code,
          name: plot.name,
          client_id: null,
          client: null,
          holds: false,
        };
        masters.set(key(SAARANG_WEST, plot.code), row);
        westAdded += 1;
      }
      if (!row) {
        blocked.push(`${deal.label}: no such plot in Masters`);
        continue;
      }

      const same = buyer && row.client && sameName(buyer, row.client);
      if (row.client && !same) {
        if (row.holds) {
          blocked.push(
            `${row.name} (${plot.project}): ${row.client}'s record holds money or signed papers`,
          );
          continue;
        }
        statements.push(`
  update units u set client_id = null, status = 'available'
    from plots p where u.plot_id = p.id and p.project_id = ${q(projectId.get(plot.project)!)} and p.code = ${q(plot.code)};
  update plots set status = 'available' where project_id = ${q(projectId.get(plot.project)!)} and code = ${q(plot.code)};`);
        const entry = released.get(row.client_id!) ?? { name: row.client, plots: [] };
        entry.plots.push(row.name);
        released.set(row.client_id!, entry);
        report.push(`Release ${row.name} (${plot.project}): ${row.client} cancelled`);
      }
      if (buyer && !same) {
        const matches = clients.filter((c) => sameName(c.name, buyer));
        if (matches.length > 1) {
          blocked.push(
            `${row.name}: "${buyer}" matches ${matches.length} clients — tidy Masters first`,
          );
          continue;
        }
        let client: string;
        if (matches.length === 1) {
          client = q(matches[0].id);
          if (matches[0].stage !== "client") {
            assigns.push(
              `  update clients set stage = 'client', lost_reason = null where id = ${client};`,
            );
          }
        } else {
          const nameKey = buyer.toLowerCase();
          if (!created.has(nameKey)) {
            const variable = `c_${++variables}`;
            created.set(nameKey, variable);
            assigns.push(`
  insert into clients (name, stage, crm_owner_id) values (${q(buyer)}, 'client', ${q(ownerOf(deal.owner))})
  returning id into ${variable};`);
          }
          client = created.get(nameKey)!;
        }
        assigns.push(`
  update units u set client_id = ${client}, status = 'sold'
    from plots p where u.plot_id = p.id and p.project_id = ${q(projectId.get(plot.project)!)} and p.code = ${q(plot.code)};
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'REGISTER: % in % has no villa to give to %', ${q(plot.name)}, ${q(plot.project)}, ${q(buyer)}; end if;
  update plots set status = 'sold' where project_id = ${q(projectId.get(plot.project)!)} and code = ${q(plot.code)};`);
        report.push(
          `Assign ${row.name} (${plot.project}) to ${buyer}${matches.length ? "" : " — a new client"}`,
        );
      }
    }
    statements.push(...assigns);

    // Released buyers holding nothing else are marked lost, with the reason.
    for (const [clientId, entry] of released) {
      const reason = `Booking cancelled — no longer holds ${entry.plots.join(", ")} (Saarang tracker, ${exportDayText})`;
      statements.push(`
  update clients set stage = 'lost', lost_reason = ${q(reason)}
   where id = ${q(clientId)} and stage <> 'lost'
     and not exists (select 1 from units where client_id = ${q(clientId)});`);
    }

    const declare = [
      "v_keep uuid;",
      "v_drop uuid;",
      "v_plot uuid;",
      "n int;",
      ...[...created.values()].map((v) => `${v} uuid;`),
    ].join("\n  ");

    console.log(report.length ? report.join("\n") : "Masters already matches the tracker.");
    if (westAdded) console.log(`(${westAdded} of those are Saarang West's new plots.)`);
    if (blocked.length) {
      console.log(
        "\nRefused — nothing is written while any of these stand:\n  " + blocked.join("\n  "),
      );
      process.exit(1);
    }
    if (statements.length === 0) return;

    const batch = `begin;
do $register$
declare
  ${declare}
begin
${statements.join("\n")}
end $register$;
${commit ? "commit;" : "do $dry$ begin raise exception 'REGISTER DRY RUN COMPLETE — rolled back'; end $dry$;"}`;

    await sql(ref, batch);
    if (!commit) {
      console.log("UNEXPECTED: the dry run did not abort. Check the database at once.");
      process.exit(1);
    }
    console.log("\nCommitted. Now run scripts/import-saarang-tracker.ts.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!commit && /REGISTER DRY RUN COMPLETE/.test(message)) {
      console.log("\nDry run OK — every change ran against the live schema; nothing was kept.");
      console.log("Re-run with --commit to write.");
      return;
    }
    console.error(message);
    process.exit(1);
  }
})();
