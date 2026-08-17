/**
 * One-off importer for the company staff list.
 *
 *   npx tsx scripts/import-staff.ts            # dry run — writes NOTHING
 *   npx tsx scripts/import-staff.ts --commit   # actually writes
 *
 * Source: the staff sheet the founder supplied on 13/08/2026 — name,
 * email address, department. Transcribed by hand into the table below,
 * the way import-saarang.ts transcribes its register, because it is a
 * working document and the department column carries two job titles.
 *
 * WHAT IT DOES, PER PERSON
 *
 *   1. Creates a login, if the email has none — the same call and the
 *      same flags as Settings' inviteUser(): auth.admin.createUser with
 *      email_confirm true and full_name in user_metadata. The 0001
 *      handle_new_user() trigger writes the profiles row from that
 *      metadata, and 0060's profiles_seed_staff_details() writes the
 *      blank directory card. Both fire inside the insert, so by the time
 *      the admin API returns, the card exists.
 *   2. Sets profiles.full_name, if it is missing or different.
 *   3. Sets the card's department and designation.
 *   4. Grants '/directory'. A directory nobody can open is not shipped.
 *
 * WHAT IT NEVER DOES
 *
 *   * It never re-creates an account that exists, and NEVER TOUCHES AN
 *     EXISTING PASSWORD. Two people already have logins.
 *   * It never deletes anything.
 *
 * THE FOUNDER'S DECISIONS, applied here:
 *
 *   * "Farm Manager" and "GH Caretaker" are DESIGNATIONS, not
 *     departments — so Gopinath M and Amal Scaria carry them in the
 *     designation column with no department, and the department list is
 *     the ten in 0060 §1.
 *   * admin@, designer@ and team@ are imported AS NORMAL PEOPLE. That is
 *     an explicit call, made with the cost stated: a shared login means
 *     no approval, indent, bill or "recorded by" line anywhere in the
 *     toolbox ever names a real person. Reversible by deactivating them
 *     in Settings.
 *
 * PASSWORDS. There is no shared starting password, not even for one run —
 * CLAUDE.md forbids seeding a real default credential, and a seeded PIN
 * that reached the live database is why.
 * Each new account gets its own twelve random characters, and the list is
 * written to /data (git-ignored) for the founder to hand over and then
 * delete.
 *
 * WHY THE SERVICE ROLE. Creating a login has no RLS path at all — that is
 * why inviteUser() is the app's one sanctioned service-role call — and the
 * card writes below set department and designation, which 0060's
 * staff_details_guard() only allows when auth.uid() is null (a script or
 * Studio) or the caller is an admin. Same justification as
 * import-catalogue.ts: trusted local code, never anything the browser
 * sees.
 *
 * SAFE TO RUN TWICE. Everything is matched on the lowercased email —
 * never the name, because two people can share one and this sheet already
 * has an "Amal K Raju" and an "Amal Scaria". Fields are compared before
 * they are written, so a second run reports "no change" and writes
 * nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "../lib/supabase/database.types";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

const DOMAIN = "goodearthkannur.org";

type Row = {
  name: string;
  /** The bit before the @. Built into an address in one place. */
  local: string;
  /** Must match a staff_departments name, or be null. */
  department: string | null;
  /** Set where the sheet's "department" was really a job title. */
  designation?: string;
};

/**
 * The sheet, in its own order. 47 rows.
 *
 * A blank department is left blank rather than guessed — the closing
 * report lists them so they can be filled in on screen in five minutes.
 */
const SHEET: Row[] = [
  { name: "Adidev", local: "adidev", department: "Engineering" },
  { name: "Admin", local: "admin", department: null },
  { name: "Akash Dileep", local: "store", department: "Logistics" },
  { name: "Akshay Arun", local: "hospitality", department: "CRM" },
  { name: "Amal K Raju", local: "amal", department: "Design" },
  // The sheet says "GH Caretaker" — a job, not a department.
  { name: "Amal Scaria", local: "birdwingcrm", department: null, designation: "GH Caretaker" },
  { name: "Anagha Mohan", local: "NVengineering", department: "Engineering" },
  { name: "Anandu Saseendran", local: "mep", department: "Engineering" },
  { name: "Anitta PB", local: "accounts", department: "Accounts" },
  { name: "Anu CRM", local: "anu", department: "CRM" },
  { name: "Arun PR", local: "arun", department: "Engineering" },
  { name: "Athul raj", local: "athulraj", department: "Project" },
  { name: "Designer", local: "designer", department: null },
  { name: "Diya Benny", local: "diya", department: "Design" },
  // The sheet says "Farm Manager" — a job, not a department.
  { name: "Gopinath M", local: "gopinath.m", department: null, designation: "Farm Manager" },
  { name: "Jiljith K", local: "jiljith", department: "Design" },
  { name: "Jinisha ES", local: "projects", department: "Engineering" },
  { name: "Jins Mathew", local: "jins", department: "Engineering" },
  { name: "Jitha TA", local: "jitha", department: null },
  { name: "John Richard", local: "construction.ph1", department: "Engineering" },
  { name: "Joseph Mathew", local: "joseph.m", department: "Design" },
  { name: "Kavin kumar Senthil", local: "kavin", department: null },
  { name: "Navarang K", local: "navarang", department: "Interior" },
  { name: "Nivedhya P", local: "nivedhya", department: "Design" },
  { name: "Rajesh Kannichankandy", local: "carpentry", department: "Carpentry" },
  { name: "Rajina N", local: "estimation", department: "Engineering" },
  { name: "Rupsa Biswas", local: "rupsa", department: "Interior" },
  { name: "Sajeesh MS", local: "construction", department: "Interior" },
  { name: "Sandeep K", local: "sandeep.k", department: "Engineering" },
  { name: "Sandra Maria George", local: "sandra", department: "Design" },
  { name: "Santhana Shanmukhan", local: "billing", department: "Accounts" },
  { name: "Saurav Cyriac", local: "saurav", department: null },
  { name: "Sayooj Devan PS", local: "sayooj", department: "Marketing" },
  { name: "Sebastina M", local: "sebastina", department: "Marketing" },
  { name: "Sharanya s", local: "sharanya", department: "Design" },
  { name: "Sharmina Omban", local: "sharmina", department: "Design" },
  { name: "Shibu Mathew", local: "shibu", department: "Project" },
  { name: "Shiraj PR", local: "construction.ph3", department: "Engineering" },
  { name: "Siddharth Cyriac", local: "siddharth", department: null },
  { name: "Sivadarsana Nambiar", local: "hr", department: "CRM" },
  { name: "Sreejith NS", local: "sreejith", department: "Interior" },
  { name: "Sunil Kumar", local: "commercial", department: "Commercial" },
  { name: "Team", local: "team", department: null },
  { name: "Vaishnav TV", local: "vaishnav", department: "Design" },
  { name: "Varghese George", local: "varghese", department: null },
  { name: "Vinitha EN", local: "vinitha", department: "Project" },
  { name: "Wafiya L", local: "qs", department: "Engineering" },
];

/**
 * I, l, 1, O and 0 are missing on purpose: these get read off a printed
 * sheet and typed once, by somebody who will not enjoy the ambiguity.
 * Twelve characters over 56 symbols is about 70 bits — comfortably past
 * MIN_PASSWORD_LENGTH 8 in lib/settings/invite.ts.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function newPassword(): string {
  // randomInt, not randomBytes(n)[i] % 56 — the modulo is measurably
  // biased towards the start of the alphabet.
  return Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

function emailFor(row: Row): string {
  return `${row.local}@${DOMAIN}`.toLowerCase();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Throws rather than pressing on with a half-read answer. */
function ok<T>(context: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${context}: no data returned`);
  return result.data;
}

/**
 * The same, for a maybeSingle() read where NO ROW IS A REAL ANSWER —
 * "this person has no /directory grant yet" is the whole question being
 * asked, not a failure. Still refuses on `error`, because an empty result
 * and a failed read mean opposite things and conflating them here would
 * make the script grant an app twice or skip a name it should fix.
 */
function okMaybe<T>(
  context: string,
  result: { data: T | null; error: { message: string } | null },
): T | null {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

async function main() {
  const commit = process.argv.includes("--commit");

  console.log(
    commit
      ? "\n=== COMMIT RUN — this creates real logins ===\n"
      : "\n=== DRY RUN — nothing will be written ===\n",
  );

  // ---- Validate everything before writing anything -------------------
  // The import-catalogue.ts rule: every problem is collected and reported
  // at once, and a single failure means nothing is written. A half-imported
  // roster is worse than no roster.
  const departments = ok(
    "read staff_departments",
    await db.from("staff_departments").select("id, name"),
  );
  const departmentByName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d.id]));

  const errors: string[] = [];
  const seen = new Set<string>();

  SHEET.forEach((row, index) => {
    const line = index + 1;
    if (!row.name.trim()) errors.push(`Row ${line}: blank name`);
    if (!row.local.trim()) errors.push(`Row ${line} (${row.name}): blank email`);

    const email = emailFor(row);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${line} (${row.name}): "${email}" is not a valid address`);
    }
    if (seen.has(email)) errors.push(`Row ${line} (${row.name}): "${email}" appears twice`);
    seen.add(email);

    if (row.department && !departmentByName.has(row.department.trim().toLowerCase())) {
      errors.push(`Row ${line} (${row.name}): no department called "${row.department}"`);
    }
  });

  if (errors.length > 0) {
    console.error(`${errors.length} problem(s) — nothing was written:\n`);
    for (const problem of errors.slice(0, 40)) console.error(`  ${problem}`);
    if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`);
    process.exit(1);
  }

  // ---- Who already has a login ---------------------------------------
  // Paged, because listUsers caps a page and a missed one would look
  // exactly like "this person has no account" and create a second.
  const existingByEmail = new Map<string, string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list users: ${error.message}`);
    for (const user of data.users) {
      if (user.email) existingByEmail.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 1000) break;
  }
  console.log(`${existingByEmail.size} accounts exist already.\n`);

  // ---- Per person ------------------------------------------------------
  const created: { name: string; email: string; password: string }[] = [];
  const kept: string[] = [];
  const noDepartment: string[] = [];
  let namesFixed = 0;
  let cardsUpdated = 0;
  let grantsAdded = 0;

  for (const row of SHEET) {
    const email = emailFor(row);
    let userId = existingByEmail.get(email);

    if (userId) {
      kept.push(`${row.name} <${email}>`);
      console.log(`  = ${row.name} <${email}> — account exists, password untouched`);
    } else {
      const password = newPassword();
      created.push({ name: row.name, email, password });
      console.log(`  + ${row.name} <${email}> — new login`);
      if (commit) {
        const { data, error } = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: row.name },
        });
        if (error) {
          throw new Error(
            `create ${email}: ${error.message}\n` +
              `Everything before this row is written. Re-run — existing accounts are skipped.`,
          );
        }
        userId = data.user.id;
      }
    }

    // Somebody carrying a designation instead (Farm Manager, GH
    // Caretaker) is already described — flagging them as "missing"
    // invites a fix that is not needed.
    if (!row.department && !row.designation) noDepartment.push(row.name);

    // A dry run has no id for anyone it would have created, and there is
    // nothing further to compare. Say so rather than reporting "no change".
    if (!userId) continue;

    // ---- The name on the profile row --------------------------------
    const profile = okMaybe(
      `read profile ${email}`,
      await db.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
    ) as { id: string; full_name: string | null } | null;

    if (profile && profile.full_name?.trim() !== row.name) {
      namesFixed += 1;
      console.log(`      name "${profile.full_name ?? ""}" → "${row.name}"`);
      if (commit) {
        const { error } = await db
          .from("profiles")
          .update({ full_name: row.name })
          .eq("id", userId);
        if (error) throw new Error(`update name ${email}: ${error.message}`);
      }
    }

    // ---- The card ----------------------------------------------------
    const departmentId = row.department
      ? (departmentByName.get(row.department.trim().toLowerCase()) ?? null)
      : null;
    const designation = row.designation ?? null;

    const card = okMaybe(
      `read card ${email}`,
      await db
        .from("staff_details")
        .select("id, department_id, designation")
        .eq("id", userId)
        .maybeSingle(),
    ) as { id: string; department_id: string | null; designation: string | null } | null;

    if (card && (card.department_id !== departmentId || card.designation !== designation)) {
      cardsUpdated += 1;
      console.log(
        `      card: department ${card.department_id ? "set" : "—"} → ${row.department ?? "—"}` +
          (designation ? `, designation → ${designation}` : ""),
      );
      if (commit) {
        // Upsert rather than update, in case an account somehow predates
        // 0060's backfill. staff_details_guard() lets this through
        // because the service role has no auth.uid() — see 0060 §4.
        const { error } = await db
          .from("staff_details")
          .upsert({ id: userId, department_id: departmentId, designation });
        if (error) throw new Error(`update card ${email}: ${error.message}`);
      }
    }

    // ---- The grant ---------------------------------------------------
    const grant = okMaybe(
      `read grant ${email}`,
      await db
        .from("user_apps")
        .select("app")
        .eq("user_id", userId)
        .eq("app", "/directory")
        .maybeSingle(),
    ) as { app: string } | null;

    if (!grant) {
      grantsAdded += 1;
      console.log(`      grant /directory`);
      if (commit) {
        const { error } = await db.from("user_apps").insert({ user_id: userId, app: "/directory" });
        // 23505 is somebody else having granted it a moment ago.
        if (error && error.code !== "23505") {
          throw new Error(`grant ${email}: ${error.message}`);
        }
      }
    }
  }

  // ---- Report ----------------------------------------------------------
  console.log(`\n${"-".repeat(64)}`);
  console.log(`People on the sheet     ${SHEET.length}`);
  console.log(`Already had a login     ${kept.length}`);
  console.log(`New logins              ${created.length}`);
  console.log(`Names corrected         ${namesFixed}`);
  console.log(`Cards updated           ${cardsUpdated}`);
  console.log(`Directory grants added  ${grantsAdded}`);

  if (noDepartment.length > 0) {
    console.log(
      `\nNo department on the sheet (${noDepartment.length}) — set these on each person's page:`,
    );
    for (const name of noDepartment) console.log(`  · ${name}`);
  }

  console.log(
    `\nNOTE: admin@, designer@ and team@ are shared mailboxes, imported as` +
      `\npeople by your decision. Anything they approve, indent or bill will` +
      `\nname the inbox, not a person. Deactivate them in Settings to undo.`,
  );

  if (!commit) {
    console.log(`\nDry run complete. Nothing was written.`);
    console.log(`(would write ${created.length} passwords to data/staff-passwords-<date>.csv)`);
    console.log(`Re-run with --commit to apply.\n`);
    return;
  }

  if (created.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const path = resolve(import.meta.dirname, "..", "data", `staff-passwords-${today}.csv`);
    const csv = [
      "name,email,password",
      ...created.map((c) => `"${c.name.replace(/"/g, '""')}",${c.email},${c.password}`),
    ].join("\n");
    writeFileSync(path, csv + "\n", "utf8");

    console.log(`\n${"!".repeat(64)}`);
    console.log(`${created.length} starting passwords written to:`);
    console.log(`  ${path}`);
    console.log(`\nThis file has every new password in it. Hand them over, then`);
    console.log(`DELETE IT. /data is git-ignored and it must never leave this machine.`);
    console.log(`${"!".repeat(64)}\n`);
  } else {
    console.log(`\nNo new logins, so no password file was written.\n`);
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
