/**
 * Fetches catalogue thumbnails into Supabase Storage.
 *
 *   npx tsx scripts/fetch-catalogue-images.ts               # dry run — writes NOTHING
 *   npx tsx scripts/fetch-catalogue-images.ts --commit      # actually writes
 *   npx tsx scripts/fetch-catalogue-images.ts --commit --limit 10   # try a few first
 *
 * For every item that has an `image_url` but no `thumb_url` yet: download the
 * vendor image, resize it to a small WebP, upload it to the `catalogue`
 * storage bucket, and write the public URL back to `items.thumb_url`.
 *
 * Why thumbnails are stored but full images are not: the source URLs point at
 * other companies' Shopify CDNs. The grid loads a thumbnail for every tile —
 * 30 full images per page would be ~15 MB against ~150 KB of thumbs — so the
 * hot path must be small and must be ours (a vendor deleting a product can't
 * blank our catalogue). The full image stays a link, because it's opened
 * rarely and isn't worth ~360 MB of storage.
 *
 * Re-runnable on purpose: rows that already have a thumb_url are skipped, so a
 * run interrupted by network failures is fixed by simply running it again.
 * This is exactly why it is a separate script from import-catalogue.ts —
 * ~900 fetches against other people's servers will produce timeouts and 404s,
 * and that must never be able to damage a clean data import.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import sharp from "sharp";
import type { Database } from "../lib/supabase/database.types";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

const BUCKET = "catalogue";
const THUMB_PX = 300;
const WEBP_QUALITY = 78;
/** Fetches run in parallel; kept low deliberately — these are other
 *  companies' servers, not ours, and there is no hurry. */
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 20_000;
const BATCH_SIZE = 200;

type PendingItem = { id: string; code: string | null; image_url: string };

async function buildThumb(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  return sharp(original)
    .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function main() {
  const commit = process.argv.includes("--commit");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(
    commit
      ? "\n=== COMMIT RUN — this writes to storage and the database ===\n"
      : "\n=== DRY RUN — nothing will be written ===\n",
  );

  // --- What's outstanding -------------------------------------------------
  const { count: needThumb } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .not("image_url", "is", null)
    .is("thumb_url", null);
  const { count: haveThumb } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .not("thumb_url", "is", null);
  const { count: noImage } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .is("image_url", null);

  console.log(`Items needing a thumbnail : ${needThumb ?? 0}`);
  console.log(`Items already done        : ${haveThumb ?? 0}`);
  console.log(
    `Items with no image at all: ${noImage ?? 0}  (these get a colour placeholder in the UI, not a fetch)`,
  );

  if (!commit) {
    console.log(
      `\nWould download, resize to ${THUMB_PX}px WebP, and upload ${Math.min(needThumb ?? 0, limit)} thumbnail(s)`,
    );
    console.log(`into the "${BUCKET}" storage bucket, writing items.thumb_url back.`);
    console.log("\nDry run complete. Nothing was written.");
    console.log("Re-run with --commit to apply (add --limit 10 to try a few first).\n");
    return;
  }

  if ((needThumb ?? 0) === 0) {
    console.log("\nNothing to do — every item with an image already has a thumbnail.\n");
    return;
  }

  // --- Bucket -------------------------------------------------------------
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true, // thumbnails are catalogue images, not private data
      fileSizeLimit: "2MB",
      allowedMimeTypes: ["image/webp"],
    });
    if (error) {
      console.error(`Could not create the "${BUCKET}" bucket:`, error.message);
      process.exit(1);
    }
    console.log(`Created public storage bucket "${BUCKET}".`);
  }

  // --- Process ------------------------------------------------------------
  let succeeded = 0;
  let processed = 0;
  const failures: { code: string | null; reason: string }[] = [];

  // A row that fails keeps its null thumb_url, so the next batch query would
  // hand back the same dead URLs forever. Exclude them for the rest of this
  // run — a fresh run still retries them, which is what you want for a
  // timeout, and costs one wasted request for a genuinely dead link.
  const failedIds: string[] = [];

  while (processed < limit) {
    const remaining = limit - processed;
    let query = supabase
      .from("items")
      .select("id, code, image_url")
      .not("image_url", "is", null)
      .is("thumb_url", null)
      .order("id")
      .limit(Math.min(BATCH_SIZE, remaining));
    if (failedIds.length > 0) query = query.not("id", "in", `(${failedIds.join(",")})`);
    const { data, error } = await query;
    if (error) {
      console.error("Could not read pending items:", error.message);
      process.exit(1);
    }
    const pending = (data ?? []) as PendingItem[];
    if (pending.length === 0) break;

    let succeededThisBatch = 0;

    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const slice = pending.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (item) => {
          try {
            const thumb = await buildThumb(item.image_url);
            const path = `items/${item.id}.webp`;
            const { error: uploadError } = await supabase.storage
              .from(BUCKET)
              .upload(path, thumb, { contentType: "image/webp", upsert: true });
            if (uploadError) throw new Error(`upload: ${uploadError.message}`);

            const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
            const { error: updateError } = await supabase
              .from("items")
              .update({ thumb_url: publicUrl.publicUrl })
              .eq("id", item.id);
            if (updateError) throw new Error(`db: ${updateError.message}`);

            succeeded++;
            succeededThisBatch++;
          } catch (error) {
            failures.push({
              code: item.code,
              reason: error instanceof Error ? error.message : String(error),
            });
            failedIds.push(item.id);
          }
        }),
      );
      processed += slice.length;
      process.stdout.write(
        `\r  processed ${processed}  ok ${succeeded}  failed ${failures.length}   `,
      );
    }

    // Belt-and-braces: failedIds already stops the same rows coming back, but
    // if a whole batch fails the source is probably down, so stop hammering it.
    if (succeededThisBatch === 0) {
      console.log(
        "\n\nEvery item in this batch failed — stopping rather than hammering the source.",
      );
      break;
    }
  }

  console.log(`\n\nDone. ${succeeded} thumbnail(s) uploaded, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures (re-run the script to retry these — successes are skipped):");
    for (const failure of failures.slice(0, 30))
      console.log(`  ${failure.code ?? "(no code)"}: ${failure.reason}`);
    if (failures.length > 30) console.log(`  …and ${failures.length - 30} more`);
  }
  console.log();
}

main().catch((error) => {
  console.error("\nImage pass failed:", error);
  process.exit(1);
});
