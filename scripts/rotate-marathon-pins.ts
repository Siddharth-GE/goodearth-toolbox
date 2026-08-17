/**
 * Rotates a Marathon agent's PIN off a known value.
 *
 *   npx tsx scripts/rotate-marathon-pins.ts --project <ref>
 *       # dry run — says which agents are on a published PIN
 *
 *   npx tsx scripts/rotate-marathon-pins.ts --project <ref> --commit
 *       # sets a fresh random PIN for each and prints it once
 *
 * WHY IT EXISTS. `0002` seeded a test agent with PIN `1234`, and that PIN,
 * its hash and its salt are all in this public repo. Two agents created
 * afterwards were given the same PIN by hand, so they carry their own
 * salts and `0070` — which deletes rows matching the published hash —
 * could not see them. A migration cannot find them either: the PIN is
 * scrypt-hashed per row, so the only way to know is to recompute the hash
 * against each agent's own salt, which needs Node.
 *
 * The kiosk sits outside Supabase Auth on purpose, so the PIN is the only
 * thing in the way. A published default matters more here than anywhere.
 *
 * DRY RUN BY DEFAULT, like every script in this folder. It prints each new
 * PIN exactly once, to the terminal and nowhere else — there is no way to
 * read it back afterwards, which is the point of hashing it.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomInt } from "node:crypto";
import { resolve } from "node:path";

import { hashPin, verifyPinHash } from "../lib/marathon/pin";
import { isCommit, requireProjectRef } from "./supabase-management";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

/**
 * PINs that have appeared in the repo, in a migration, or in a document.
 * Anything on this list is public knowledge and must not open a kiosk.
 */
const PUBLISHED_PINS = ["1234", "0000", "1111"];

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  // The service-role key in .env.local belongs to whichever project that
  // file points at. Refuse rather than silently rotating PINs on the
  // wrong database — the same argument as --project never defaulting.
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

  const exposed = (agents ?? []).filter((agent) =>
    PUBLISHED_PINS.some((pin) => verifyPinHash(pin, agent.pin_hash, agent.pin_salt)),
  );

  console.log(`Database : ${ref}`);
  console.log(`Agents   : ${agents?.length ?? 0}`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);

  if (exposed.length === 0) {
    console.log("No agent is on a published PIN. Nothing to do.");
    return;
  }

  console.log(`${exposed.length} on a published PIN:`);
  for (const agent of exposed) console.log(`  ${agent.name}`);

  if (!commit) {
    console.log("\nDry run. Nothing was written. Re-run with --commit to rotate.");
    return;
  }

  console.log("\nNew PINs — WRITE THESE DOWN, they cannot be read back:\n");
  for (const agent of exposed) {
    // randomInt, not Math.random: a PIN is a credential.
    const pin = String(randomInt(1000, 10000));
    if (PUBLISHED_PINS.includes(pin)) {
      console.log(`  ${agent.name.padEnd(20)} skipped — drew a published PIN, run again`);
      continue;
    }
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

  console.log("\nAny of these can be changed again in /marathon/admin → Members → Reset PIN.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
