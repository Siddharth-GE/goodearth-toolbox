/**
 * One-off importer for the Saarang plot/villa/client register.
 *
 *   npx tsx scripts/import-saarang.ts            # dry run — writes NOTHING
 *   npx tsx scripts/import-saarang.ts --commit   # actually writes
 *
 * Source: "Area and BUA - Saarang, GoodEarth - Overall Sheet-To do list",
 * last updated on the sheet 05/08/2026. Transcribed by hand into the table
 * below, because the sheet is a working document with merged cells and
 * per-client notes that no parser should be trusted with.
 *
 * WHAT THE SHEET SAYS AND HOW IT IS READ HERE
 *
 *   * Every plot carries exactly one villa. The founder's words.
 *   * Three rows cover two plots each — 22&23, 41&42, 45&46 — where a
 *     client bought a pair and one villa spans both. Those become ONE plot
 *     record ("Plot 22 & 23") with ONE villa ("Villa 22"), by decision.
 *     So 43 plots and 43 villas, not 46: the sheet's "Sale Count: 38"
 *     counts physical plots, which is 35 plot records here plus the three
 *     doubled ones.
 *   * Plots 3, 18, 19, 20 and 21 have no client — available.
 *     Plots 34, 35 and 43 are "Blocked" on the sheet. There is no blocked
 *     status in the schema (available/reserved/sold), so they go in as
 *     RESERVED, which is the honest neighbour.
 *   * "Satheesh and Aruna" hold plots 17 AND 39. One client record, two
 *     villas — which is why clients are matched on name, not created per
 *     row.
 *   * The sheet carries no plot areas, so `area` is left alone. The three
 *     plots that already exist keep whatever they have.
 *
 * SAFE TO RUN TWICE. Everything is matched on its natural key — plot code,
 * unit code, client name — and updated in place rather than inserted
 * blindly. Nothing is ever deleted: Saarang's existing Villa 6, 8 and 31
 * already carry 17 selections, 9 budgets and 14 indents between them, and
 * those rows are corrected, not replaced.
 *
 * Uses the service-role key because masters writes are admin-only under
 * RLS (0004_masters.sql) and a script has no Supabase Auth session. Same
 * justification as scripts/import-catalogue.ts — trusted local code, never
 * anything the browser sees.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import type { Database } from "../lib/supabase/database.types";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

const PROJECT_NAME = "Saarang";

/** Mirrors the CHECK in 0004_masters.sql. */
type Status = "available" | "reserved" | "sold";

/**
 * One row of the register.
 *
 * `plot` is the plot number as it reads on the ground; `label` overrides
 * the display name for the three doubled plots. `client` null means the
 * plot has no buyer yet.
 */
type Row = {
  plot: number;
  /** Display name, when it isn't simply "Plot <n>". */
  label?: string;
  /** Code suffix, when it isn't simply the number. */
  codeSuffix?: string;
  client: string | null;
  status: Status;
};

const REGISTER: Row[] = [
  { plot: 1, client: "Chandra and Preethi", status: "sold" },
  { plot: 2, client: "Saravana and Sathya", status: "sold" },
  { plot: 3, client: null, status: "available" },
  { plot: 4, client: "Priya Krishnan", status: "sold" },
  { plot: 5, client: "Sohil Palan and Tanushree Agnihotri", status: "sold" },
  { plot: 6, client: "Nilanjana Biswas", status: "sold" },
  { plot: 7, client: "Aastha Rai", status: "sold" },
  { plot: 8, client: "Ganga Ramabhatta", status: "sold" },
  { plot: 9, client: "Rashmi", status: "sold" },
  { plot: 10, client: "Sanjeev Sudheer", status: "sold" },
  { plot: 11, client: "Tom Chacko Boban", status: "sold" },
  { plot: 12, client: "Mrs. Aruna Gopakumar", status: "sold" },
  { plot: 13, client: "Manas Sharma", status: "sold" },
  { plot: 14, client: "M R Sathyanarayan & Bhavani", status: "sold" },
  { plot: 15, client: "Sabari & Aarthi", status: "sold" },
  { plot: 16, client: "Sosha", status: "sold" },
  // Also holds plot 39 — one client, two villas.
  { plot: 17, client: "Satheesh and Aruna", status: "sold" },
  { plot: 18, client: null, status: "available" },
  { plot: 19, client: null, status: "available" },
  { plot: 20, client: null, status: "available" },
  { plot: 21, client: null, status: "available" },
  {
    plot: 22,
    label: "Plot 22 & 23",
    codeSuffix: "22-23",
    client: "Rajesh Mahadevan",
    status: "sold",
  },
  { plot: 24, client: "Sajeesh Padmanabhan", status: "sold" },
  { plot: 25, client: "Hemanth Rajagopalan Nallakandy Payyanadan", status: "sold" },
  // Sheet reads "Manoj and sheela"; capitalised here.
  { plot: 26, client: "Manoj and Sheela", status: "sold" },
  { plot: 27, client: "Vidyakanth", status: "sold" },
  { plot: 28, client: "Hari & Vidhya", status: "sold" },
  { plot: 29, client: "Nithya", status: "sold" },
  { plot: 30, client: "Shivendra", status: "sold" },
  { plot: 31, client: "Sangeeta Mathrani & Rajesh Mathrani", status: "sold" },
  { plot: 32, client: "Mridul", status: "sold" },
  { plot: 33, client: "Harman & Aman Pal", status: "sold" },
  // "Blocked" on the sheet; reserved is the closest status the schema has.
  { plot: 34, client: null, status: "reserved" },
  { plot: 35, client: null, status: "reserved" },
  { plot: 36, client: "Siddharth Kale", status: "sold" },
  { plot: 37, client: "Sreekumar", status: "sold" },
  { plot: 38, client: "Aravind", status: "sold" },
  { plot: 39, client: "Satheesh and Aruna", status: "sold" },
  { plot: 40, client: "Suma & Suresh", status: "sold" },
  {
    plot: 41,
    label: "Plot 41 & 42",
    codeSuffix: "41-42",
    client: "Lavleen Riar",
    status: "sold",
  },
  { plot: 43, client: null, status: "reserved" },
  { plot: 44, client: "Suniti Seth", status: "sold" },
  {
    plot: 45,
    label: "Plot 45 & 46",
    codeSuffix: "45-46",
    client: "Shyam Sundar",
    status: "sold",
  },
];

function plotName(row: Row): string {
  return row.label ?? `Plot ${row.plot}`;
}
function plotCode(row: Row): string {
  return `P${row.codeSuffix ?? row.plot}`;
}
/** The villa always takes the FIRST plot number, doubled plots included. */
function unitName(row: Row): string {
  return `Villa ${row.plot}`;
}
function unitCode(row: Row): string {
  return `V${row.plot}`;
}

const commit = process.argv.includes("--commit");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient<Database>(url, key);

/**
 * Throw rather than press on: a half-read register is worse than none.
 *
 * Returns NonNullable so a `.single()` call — whose `data` is typed
 * nullable — narrows properly at the call site rather than letting the
 * null leak into the inferred type.
 */
function ok<T>(what: string, { data, error }: { data: T | null; error: unknown }): NonNullable<T> {
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  if (data === null || data === undefined) throw new Error(`${what}: no data`);
  return data as NonNullable<T>;
}

async function main() {
  console.log(commit ? "COMMIT — writing to the database\n" : "DRY RUN — writing nothing\n");

  const projects = ok(
    "read projects",
    await db.from("projects").select("id,name").eq("name", PROJECT_NAME),
  );
  if (projects.length !== 1) {
    throw new Error(`Expected exactly one project named ${PROJECT_NAME}, found ${projects.length}`);
  }
  const projectId = projects[0].id;

  const existingPlots = ok(
    "read plots",
    await db.from("plots").select("id,name,code,status").eq("project_id", projectId),
  );
  const existingUnits = ok(
    "read units",
    await db.from("units").select("id,name,code,status,client_id").eq("project_id", projectId),
  );
  const existingClients = ok("read clients", await db.from("clients").select("id,name"));

  const plotByCode = new Map(existingPlots.filter((p) => p.code).map((p) => [p.code!, p]));
  const unitByCode = new Map(existingUnits.filter((u) => u.code).map((u) => [u.code!, u]));
  const clientByName = new Map(
    existingClients.map((c) => [c.name.trim().toLowerCase(), c] as const),
  );

  // ---- Clients ------------------------------------------------------
  const wanted = [...new Set(REGISTER.map((r) => r.client).filter((n): n is string => !!n))];
  const missingClients = wanted.filter((n) => !clientByName.has(n.trim().toLowerCase()));
  console.log(`Clients: ${wanted.length} on the sheet, ${missingClients.length} to create`);
  for (const name of missingClients) console.log(`  + ${name}`);

  if (commit && missingClients.length > 0) {
    const created = ok(
      "insert clients",
      await db
        .from("clients")
        .insert(missingClients.map((name) => ({ name })))
        .select("id,name"),
    );
    for (const c of created) clientByName.set(c.name.trim().toLowerCase(), c);
  } else if (!commit) {
    // Stand-in ids for the clients a real run would have created by now.
    // Without them every not-yet-existing client resolves to null, an
    // existing villa with no client compares null-to-null, and the dry
    // run silently reports NO CHANGE for a row it would in fact update —
    // which is the one thing a dry run must never do.
    for (const name of missingClients) {
      clientByName.set(name.trim().toLowerCase(), { id: `pending:${name}`, name });
    }
  }

  // ---- Plots --------------------------------------------------------
  let plotsCreated = 0;
  let plotsUpdated = 0;
  console.log(`\nPlots: ${REGISTER.length} on the sheet`);
  for (const row of REGISTER) {
    const code = plotCode(row);
    const name = plotName(row);
    const found = plotByCode.get(code);

    if (!found) {
      plotsCreated += 1;
      console.log(`  + ${name} (${code}) — ${row.status}`);
      if (commit) {
        const created = ok(
          `insert plot ${code}`,
          await db
            .from("plots")
            .insert({ project_id: projectId, name, code, status: row.status })
            .select("id,name,code,status")
            .single(),
        );
        plotByCode.set(code, created);
      }
      continue;
    }

    if (found.name !== name || found.status !== row.status) {
      plotsUpdated += 1;
      console.log(
        `  ~ ${found.name} (${code}) — name "${found.name}" → "${name}", status ${found.status} → ${row.status}`,
      );
      if (commit) {
        ok(
          `update plot ${code}`,
          await db
            .from("plots")
            .update({ name, status: row.status })
            .eq("id", found.id)
            .select("id"),
        );
      }
    }
  }

  // ---- Units --------------------------------------------------------
  let unitsCreated = 0;
  let unitsUpdated = 0;
  console.log(`\nVillas: ${REGISTER.length} on the sheet`);
  for (const row of REGISTER) {
    const code = unitCode(row);
    const name = unitName(row);
    const plot = plotByCode.get(plotCode(row));
    const clientId = row.client
      ? (clientByName.get(row.client.trim().toLowerCase())?.id ?? null)
      : null;

    if (commit && !plot) throw new Error(`No plot for ${code} — plot pass did not complete`);
    if (commit && row.client && !clientId) throw new Error(`No client id for ${row.client}`);

    const found = unitByCode.get(code);
    if (!found) {
      unitsCreated += 1;
      console.log(`  + ${name} (${code}) — ${row.status}${row.client ? ` — ${row.client}` : ""}`);
      if (commit) {
        ok(
          `insert unit ${code}`,
          await db
            .from("units")
            .insert({
              project_id: projectId,
              plot_id: plot!.id,
              name,
              code,
              unit_type: "villa",
              status: row.status,
              client_id: clientId,
            })
            .select("id"),
        );
      }
      continue;
    }

    const changes: string[] = [];
    if (found.name !== name) changes.push(`name "${found.name}" → "${name}"`);
    if (found.status !== row.status) changes.push(`status ${found.status} → ${row.status}`);
    if (found.client_id !== clientId) {
      const was = existingClients.find((c) => c.id === found.client_id)?.name ?? "none";
      changes.push(`client ${was} → ${row.client ?? "none"}`);
    }
    if (changes.length > 0) {
      unitsUpdated += 1;
      console.log(`  ~ ${found.name} (${code}) — ${changes.join(", ")}`);
      if (commit) {
        ok(
          `update unit ${code}`,
          await db
            .from("units")
            .update({
              name,
              status: row.status,
              client_id: clientId,
              plot_id: plot!.id,
              unit_type: "villa",
            })
            .eq("id", found.id)
            .select("id"),
        );
      }
    }
  }

  const sold = REGISTER.filter((r) => r.status === "sold").length;
  console.log(
    `\n${commit ? "Wrote" : "Would write"}: ${missingClients.length} clients, ` +
      `${plotsCreated} plots created / ${plotsUpdated} corrected, ` +
      `${unitsCreated} villas created / ${unitsUpdated} corrected.`,
  );
  console.log(
    `Register: ${REGISTER.length} plots · ${sold} sold · ` +
      `${REGISTER.filter((r) => r.status === "reserved").length} reserved · ` +
      `${REGISTER.filter((r) => r.status === "available").length} available · ` +
      `${wanted.length} distinct clients`,
  );
  if (!commit) console.log("\nNothing was written. Re-run with --commit to apply.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
