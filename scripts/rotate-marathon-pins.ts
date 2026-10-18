/**
 * Rotates Marathon PINs off published values: each agent's, and the
 * shared admin PIN. Run it on every new database (SHIPPING.md).
 *
 *   npx tsx scripts/rotate-marathon-pins.ts --project <ref>
 *       # dry run — says which PINs are published
 *
 *   npx tsx scripts/rotate-marathon-pins.ts --project <ref> --commit
 *       # sets a fresh random PIN for each and prints it once
 *
 * `0002` seeds agent PIN `1234` and admin PIN `2026` in this public repo,
 * and agents were later given the same PIN by hand with their own salts.
 * The PIN is scrypt-hashed per row, so only Node can find them: recompute
 * each published PIN against each row's salt. The kiosk sits outside
 * Supabase Auth, so the PIN is the only thing in the way.
 *
 * Each new PIN is printed once, to the terminal and nowhere else.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomInt } from "node:crypto";
import { resolve } from "node:path";

import { hashPin, verifyPinHash } from "../lib/marathon/pin";
import { isCommit, requireProjectRef } from "./supabase-management";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

/** PINs that have appeared in the repo, a migration or a document. */
const PUBLISHED_PINS = ["1234", "0000", "1111", "2026"];

const isPublished = (hash: string, salt: string) =>
  PUBLISHED_PINS.some((pin) => verifyPinHash(pin, hash, salt));

/** randomInt, not Math.random: a PIN is a credential. */
function freshPin(digits: number): string {
  const pin = String(randomInt(0, 10 ** digits)).padStart(digits, "0");
  return PUBLISHED_PINS.includes(pin) ? freshPin(digits) : pin;
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  // The service-role key in .env.local belongs to whichever project that
  // file points at; refuse rather than rotate PINs on the wrong database.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!url.includes(ref)) {
    throw new Error(
      `.env.local points at ${url || "nothing"}, not ${ref}. This script writes with the\n` +
        `service-role key from that file, so it can only act on the project it belongs to.`,
    );
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing from .env.local.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: agents, error } = await supabase
    .from("marathon_agents")
    .select("id, name, pin_hash, pin_salt")
    .order("name");
  if (error) throw new Error(`Could not read the agents: ${error.message}`);

  const { data: config, error: configError } = await supabase
    .from("marathon_config")
    .select("id, admin_pin_hash, admin_pin_salt")
    .maybeSingle();
  if (configError) throw new Error(`Could not read the admin PIN: ${configError.message}`);

  const exposed = (agents ?? []).filter((agent) => isPublished(agent.pin_hash, agent.pin_salt));
  const adminExposed = !!config && isPublished(config.admin_pin_hash, config.admin_pin_salt);

  console.log(`Database : ${ref}`);
  console.log(`Agents   : ${agents?.length ?? 0}`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);

  if (exposed.length === 0 && !adminExposed) {
    console.log("No agent and no admin PIN is on a published PIN. Nothing to do.");
    return;
  }

  if (adminExposed) console.log("The shared admin PIN is a published PIN.");
  if (exposed.length > 0) {
    console.log(`${exposed.length} agent(s) on a published PIN:`);
    for (const agent of exposed) console.log(`  ${agent.name}`);
  }

  if (!commit) {
    console.log("\nDry run. Nothing was written. Re-run with --commit to rotate.");
    return;
  }

  console.log("\nNew PINs — WRITE THESE DOWN, they cannot be read back:\n");

  if (adminExposed) {
    const pin = freshPin(6);
    const { hash, salt } = hashPin(pin);
    const { error: updateError } = await supabase
      .from("marathon_config")
      .update({ admin_pin_hash: hash, admin_pin_salt: salt })
      .eq("id", config.id);
    if (updateError) {
      console.log(`  ${"Admin PIN".padEnd(20)} FAILED — ${updateError.message}`);
      process.exitCode = 1;
    } else {
      console.log(`  ${"Admin PIN".padEnd(20)} ${pin}`);
    }
  }

  for (const agent of exposed) {
    const pin = freshPin(4);
    const { hash, salt } = hashPin(pin);
    const { error: updateError } = await supabase
      .from("marathon_agents")
      .update({ pin_hash: hash, pin_salt: salt })
      .eq("id", agent.id);
    if (updateError) {
      console.log(`  ${agent.name.padEnd(20)} FAILED — ${updateError.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`  ${agent.name.padEnd(20)} ${pin}`);
  }

  console.log("\nAn agent's PIN can be changed again in /marathon/admin → Members → Reset PIN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
