/**
 * Copies Storage objects from one Supabase project to another, and fixes
 * the URLs that point at them.
 *
 *   npx tsx scripts/copy-storage.ts --from <ref> --to <ref>
 *       # dry run — lists what it WOULD copy, writes nothing
 *
 *   npx tsx scripts/copy-storage.ts --from <ref> --to <ref> --commit
 *
 * WHY THIS EXISTS. clone-data.ts moves rows; rows are not files. The
 * `catalogue` bucket holds 897 item thumbnails, and `items.thumb_url`
 * holds absolute URLs naming the project they live in. Copy the rows
 * alone and every thumbnail on the new database points back at the old
 * one — which would *look* fine in a browser, because that bucket is
 * public, right up until you notice next.config.ts only allows the host
 * in NEXT_PUBLIC_SUPABASE_URL. next/image blocks every other host, so the
 * entire catalogue grid comes up empty with no failed request to explain
 * it. Hence: copy the files, then rewrite the column.
 *
 * WHY NOT fetch-catalogue-images.ts. That script rebuilds thumbnails by
 * re-downloading ~900 originals from other companies' Shopify CDNs, and
 * is written to survive their timeouts and 404s. It is the right tool for
 * building the catalogue and the wrong one for moving it: a vendor who
 * has deleted a product since would silently cost us that thumbnail. Both
 * buckets here are ours. It stays the fallback if a file is missing.
 *
 * UPLOADS HAND STORAGE A Blob, NEVER A Buffer. BUGCATCHER.md's newest
 * entry: Next's patched fetch text-decodes a raw Buffer and stores
 * mangled bytes while reporting success. The upload "works" and the image
 * is rubbish.
 *
 * KEYS. Service-role keys for both projects are fetched from the
 * management API using SUPABASE_ACCESS_TOKEN, rather than kept in
 * .env.local. One fewer secret on disk, and no chance of the script
 * reading a stale key for the wrong project.
 *
 * SAFE TO RUN TWICE. Uploads use upsert, and the URL rewrite only matches
 * URLs still naming the source project.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isCommit, literal, managementToken, requireProjectRef, sql } from "./supabase-management";

/** Buckets to move, and nothing else. */
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

    // download.data is already a Blob. It is handed over untouched — the
    // moment this becomes a Buffer, the bytes get text-decoded on the way
    // out and the upload succeeds with rubbish in it.
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

  // ---- point the URLs at their new home --------------------------------
  //
  // Under replica mode, so the audit trigger stays quiet. Without it this
  // one statement files 897 "items UPDATE" rows, and a brand-new
  // database's audit log opens with 897 entries about its own setup
  // rather than about anything anyone did.
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
