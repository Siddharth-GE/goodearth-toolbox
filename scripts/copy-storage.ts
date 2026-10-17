/**
 * Copies Storage objects from one Supabase project to another and rewrites the URLs
 * that point at them.
 *
 *   npx tsx scripts/copy-storage.ts --from <ref> --to <ref>            # dry run, writes nothing
 *   npx tsx scripts/copy-storage.ts --from <ref> --to <ref> --commit
 *
 * clone-data.ts moves rows, not files. `items.thumb_url` names the source project, and
 * next.config.ts only allows the current host, so without the rewrite the catalogue
 * grid comes up empty with no failed request. fetch-catalogue-images.ts is not used: it
 * re-downloads from vendor CDNs and would lose deleted thumbnails.
 * Uploads take a Blob, never a Buffer (BUGCATCHER: a raw Buffer is mangled silently).
 * Service-role keys are fetched through the management API, so none sit in .env.local.
 * Safe to run twice: uploads upsert and the rewrite only matches source-project URLs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isCommit, literal, managementToken, requireProjectRef, sql } from "./supabase-management";

const BUCKETS = ["catalogue", "staff-photos", "design-views"];

async function serviceClient(ref: string): Promise<SupabaseClient> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
    headers: { Authorization: `Bearer ${managementToken()}` },
  });
  if (!response.ok) {
    throw new Error(`${ref}: could not read API keys (HTTP ${response.status})`);
  }
  const keys = (await response.json()) as { name: string; api_key: string }[];
  const serviceRole = keys.find((key) => key.name === "service_role")?.api_key;
  if (!serviceRole) throw new Error(`${ref}: no service_role key returned`);

  return createClient(`https://${ref}.supabase.co`, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type StoredObject = { bucket_id: string; name: string; mimetype: string | null };

async function listObjects(ref: string): Promise<StoredObject[]> {
  return sql<StoredObject>(
    ref,
    `select bucket_id, name, metadata->>'mimetype' as mimetype
     from storage.objects
     where bucket_id in (${BUCKETS.map(literal).join(", ")})
     order by bucket_id, name`,
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const from = requireProjectRef(argv, "--from");
  const to = requireProjectRef(argv, "--to");
  const commit = isCommit(argv);

  if (from === to) {
    console.log("--from and --to are the same project. Nothing done.");
    return;
  }

  console.log(`From : ${from}`);
  console.log(`To   : ${to}`);
  console.log(`Mode : ${commit ? "COMMIT" : "dry run"}\n`);

  const objects = await listObjects(from);
  const byBucket = new Map<string, number>();
  for (const object of objects) {
    byBucket.set(object.bucket_id, (byBucket.get(object.bucket_id) ?? 0) + 1);
  }
  for (const bucket of BUCKETS) {
    console.log(`  ${String(byBucket.get(bucket) ?? 0).padStart(4)}  ${bucket}`);
  }

  const affected = await sql<{ n: string }>(
    from,
    `select count(*)::text as n from items where thumb_url like ${literal(`%${from}%`)}`,
  );
  console.log(`\n  ${affected[0]?.n ?? 0} items have a thumb_url naming the source project`);

  if (!commit) {
    console.log("\nDry run. Nothing was written. Re-run with --commit to copy.");
    return;
  }

  const [source, target] = await Promise.all([serviceClient(from), serviceClient(to)]);

  console.log("\nCopying files...");
  let copied = 0;
  const failed: string[] = [];

  for (const object of objects) {
    const download = await source.storage.from(object.bucket_id).download(object.name);
    if (download.error || !download.data) {
      failed.push(`${object.bucket_id}/${object.name} — download: ${download.error?.message}`);
      continue;
    }

    // download.data is already a Blob. Keep it one: a Buffer is text-decoded and corrupted.
    const upload = await target.storage.from(object.bucket_id).upload(object.name, download.data, {
      contentType: object.mimetype ?? undefined,
      upsert: true,
    });
    if (upload.error) {
      failed.push(`${object.bucket_id}/${object.name} — upload: ${upload.error.message}`);
      continue;
    }

    copied += 1;
    if (copied % 100 === 0) console.log(`  ${copied} of ${objects.length}`);
  }

  console.log(`  ${copied} of ${objects.length} copied`);
  for (const problem of failed) console.error(`  FAILED ${problem}`);

  // Replica mode keeps the audit trigger quiet, so the new database's log
  // does not open with 897 "items UPDATE" rows.
  console.log("\nRewriting items.thumb_url...");
  await sql(
    to,
    `set session_replication_role = replica;
     update items
     set thumb_url = replace(thumb_url, ${literal(from)}, ${literal(to)})
     where thumb_url like ${literal(`%${from}%`)}`,
  );

  const stragglers = await sql<{ n: string }>(
    to,
    `select count(*)::text as n from items where thumb_url like ${literal(`%${from}%`)}`,
  );
  const pointing = await sql<{ n: string }>(
    to,
    `select count(*)::text as n from items where thumb_url like ${literal(`%${to}%`)}`,
  );
  console.log(`  ${pointing[0]?.n ?? 0} items now point at the target project`);

  if (Number(stragglers[0]?.n ?? 0) > 0) {
    console.error(`  ${stragglers[0]?.n} still name the source project`);
    process.exitCode = 1;
    return;
  }
  if (failed.length > 0) {
    console.error(`\n${failed.length} file(s) did not copy.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
