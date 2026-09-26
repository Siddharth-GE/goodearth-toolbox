/**
 * Fetches catalogue pictures into Supabase Storage.
 *
 *   npx tsx scripts/fetch-catalogue-images.ts --project <ref>                      # dry run — writes NOTHING
 *   npx tsx scripts/fetch-catalogue-images.ts --project <ref> --commit             # actually writes
 *   npx tsx scripts/fetch-catalogue-images.ts --project <ref> --commit --limit 10  # try a few first
 *
 * Two passes, each re-runnable:
 *
 * 1. FIND. An item with a product link (`source_url`) and no picture at
 *    all gets the vendor's main product photo as its `image_url`. Most
 *    vendors are Shopify stores, whose `/products/<handle>.js` answers
 *    with ~6 KB of JSON naming the photo — the page itself is ~3 MB.
 *    Anything else is read from the page's `og:image`. A collection page
 *    is skipped: its picture is a banner, not the product. Added
 *    2026-09-26, when 1,251 Whispering Homes items had a link and nothing
 *    to look at (import-catalogue-sheet.ts brought the links).
 *
 * 2. THUMB. For every item that has an `image_url` but no `thumb_url`
 *    yet: download the picture, resize it to a small WebP, upload it to
 *    the `catalogue` bucket, and write the public URL back to
 *    `items.thumb_url`.
 *
 * Why thumbnails are stored but full images are not: the source URLs point at
 * other companies' Shopify CDNs. The grid loads a thumbnail for every tile —
 * 30 full images per page would be ~15 MB against ~150 KB of thumbs — so the
 * hot path must be small and must be ours (a vendor deleting a product can't
 * blank our catalogue). The full image stays a link, because it's opened
 * rarely and isn't worth ~360 MB of storage.
 *
 * Re-runnable on purpose: rows already done are skipped, so a run interrupted
 * by network failures is fixed by simply running it again. This is exactly
 * why it is a separate script from the importers — ~2,000 fetches against
 * other people's servers will produce timeouts and 404s, and that must never
 * be able to damage a clean data import.
 */
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../lib/supabase/database.types";
import { isCommit, requireProjectRef, serviceRoleKey } from "./supabase-management";

const BUCKET = "catalogue";
const THUMB_PX = 300;
const WEBP_QUALITY = 78;
/** Fetches run in parallel; kept low deliberately — these are other
 *  companies' servers, not ours, and there is no hurry. */
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 20_000;
const BATCH_SIZE = 200;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; GoodearthToolbox/1.0; catalogue pictures)",
};

type Client = ReturnType<typeof createClient<Database>>;

function get(url: string): Promise<Response> {
  return fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/** A collection or category page shows a banner, not the product. */
function isProductPage(pageUrl: string): boolean {
  try {
    const path = new URL(pageUrl).pathname;
    return !/\/(collections|category|categories)\//i.test(path) || /\/products?\//i.test(path);
  } catch {
    return false;
  }
}

/** The vendor's main photo for a product page. */
async function findPicture(pageUrl: string): Promise<string> {
  const page = new URL(pageUrl);
  const handle = /\/products?\/([^/?#]+)/i.exec(page.pathname)?.[1];
  if (handle) {
    try {
      const response = await get(`${page.origin}/products/${handle}.js`);
      if (response.ok) {
        const product = JSON.parse(await response.text()) as {
          featured_image?: string | null;
          images?: string[];
        };
        const src = product.featured_image ?? product.images?.[0];
        // Shopify writes "//cdn.shopify.com/…"; resolving against the page supplies https.
        if (src) return new URL(src, page).toString();
      }
    } catch {
      // Not a Shopify store, or not JSON — the page itself is the fallback.
    }
  }
  const response = await get(pageUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .find((m) => /property=["']og:image(:secure_url)?["']/i.test(m));
  const content = tag && /content=["']([^"']+)["']/i.exec(tag)?.[1];
  if (!content) throw new Error("no product photo on the page");
  return new URL(content.replace(/&amp;/g, "&"), page).toString();
}

async function buildThumb(imageUrl: string): Promise<Buffer> {
  // Shopify's CDN resizes on request: ask for 600px rather than pulling a
  // 2 MB original to throw most of it away.
  const source = new URL(imageUrl);
  if (source.hostname === "cdn.shopify.com" || source.pathname.includes("/cdn/shop/")) {
    source.searchParams.set("width", "600");
  }
  const response = await get(source.toString());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  return sharp(original)
    .rotate()
    .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

async function count(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
) {
  const { count: n, error } = await query;
  if (error) throw new Error(`Could not count items: ${error.message}`);
  return n ?? 0;
}

type Failure = { code: string | null; reason: string };

/**
 * Runs `work` over pending rows in batches until none are left, the limit
 * is reached, or a whole batch fails (the source is probably down — stop
 * rather than hammer it). Batches walk forward by id, so a failed row —
 * still pending — is passed once and not met again this run; a fresh run
 * retries it, which is what you want for a timeout.
 */
async function drain<T extends { id: string; code: string | null }>(
  label: string,
  limit: number,
  pending: (after: string, size: number) => Promise<T[]>,
  work: (row: T) => Promise<void>,
): Promise<{ succeeded: number; failures: Failure[] }> {
  let succeeded = 0;
  let processed = 0;
  const failures: Failure[] = [];
  let after = "";

  while (processed < limit) {
    const rows = await pending(after, Math.min(BATCH_SIZE, limit - processed));
    if (rows.length === 0) break;
    after = rows[rows.length - 1].id;
    let succeededThisBatch = 0;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const slice = rows.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (row) => {
          try {
            await work(row);
            succeeded++;
            succeededThisBatch++;
          } catch (error) {
            failures.push({
              code: row.code,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
      processed += slice.length;
      process.stdout.write(
        `\r  ${label}: processed ${processed}  ok ${succeeded}  failed ${failures.length}   `,
      );
    }
    if (succeededThisBatch === 0) {
      console.log(
        "\n\nEvery item in this batch failed — stopping rather than hammering the source.",
      );
      break;
    }
  }
  console.log();
  return { succeeded, failures };
}

function report(label: string, succeeded: number, failures: Failure[]) {
  console.log(`\n${label}: ${succeeded} done, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log("Failures (re-run the script to retry these — successes are skipped):");
    for (const failure of failures.slice(0, 30))
      console.log(`  ${failure.code ?? "(no code)"}: ${failure.reason}`);
    if (failures.length > 30) console.log(`  …and ${failures.length - 30} more`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);
  const limitArg = argv.indexOf("--limit");
  const limit = limitArg !== -1 ? Number(argv[limitArg + 1]) : Infinity;

  const supabase: Client = createClient<Database>(
    `https://${ref}.supabase.co`,
    await serviceRoleKey(ref),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const items = () => supabase.from("items");

  console.log(
    commit
      ? `\n=== COMMIT RUN against ${ref} — this writes to storage and the database ===\n`
      : `\n=== DRY RUN against ${ref} — nothing will be written ===\n`,
  );

  // --- What's outstanding -------------------------------------------------
  const toFind = await count(
    items()
      .select("id", { count: "exact", head: true })
      .not("source_url", "is", null)
      .is("image_url", null)
      .is("thumb_url", null),
  );
  const needThumb = await count(
    items()
      .select("id", { count: "exact", head: true })
      .not("image_url", "is", null)
      .is("thumb_url", null),
  );
  const haveThumb = await count(
    items().select("id", { count: "exact", head: true }).not("thumb_url", "is", null),
  );
  const nothing = await count(
    items()
      .select("id", { count: "exact", head: true })
      .eq("kind", "catalogue")
      .is("source_url", null)
      .is("image_url", null)
      .is("thumb_url", null),
  );

  console.log(`Items with a product link and no picture : ${toFind}`);
  console.log(`Items with a picture but no thumbnail     : ${needThumb}`);
  console.log(`Items already done                        : ${haveThumb}`);
  console.log(
    `Catalogue items with neither a link nor a picture: ${nothing}  (these keep the coloured tile)`,
  );

  if (!commit) {
    console.log(
      `\nWould look up ${Math.min(toFind, limit)} product photo(s) from their links, then download,`,
    );
    console.log(
      `resize to ${THUMB_PX}px WebP and upload up to ${Math.min(needThumb + toFind, limit)} thumbnail(s)`,
    );
    console.log(`into the "${BUCKET}" storage bucket, writing items.image_url and thumb_url back.`);
    console.log("\nDry run complete. Nothing was written.");
    console.log("Re-run with --commit to apply (add --limit 10 to try a few first).\n");
    return;
  }

  // --- 1. Find a picture for items that only have a link ------------------
  type LinkOnly = { id: string; code: string | null; source_url: string };
  const found = await drain<LinkOnly>(
    "finding photos",
    limit,
    async (after, size) => {
      let query = items()
        .select("id, code, source_url")
        .not("source_url", "is", null)
        .is("image_url", null)
        .is("thumb_url", null)
        .order("id")
        .limit(size);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw new Error(`Could not read items with links: ${error.message}`);
      return (data ?? []) as LinkOnly[];
    },
    async (item) => {
      if (!isProductPage(item.source_url)) throw new Error("a collection page, not a product");
      const picture = await findPicture(item.source_url);
      const { error } = await items()
        .update({ image_url: picture })
        .eq("id", item.id)
        .is("image_url", null);
      if (error) throw new Error(`db: ${error.message}`);
    },
  );
  report("Photos found from product links", found.succeeded, found.failures);

  // --- 2. Thumbnails ---------------------------------------------------------
  type WithPicture = { id: string; code: string | null; image_url: string };
  const thumbs = await drain<WithPicture>(
    "thumbnails",
    limit,
    async (after, size) => {
      let query = items()
        .select("id, code, image_url")
        .not("image_url", "is", null)
        .is("thumb_url", null)
        .order("id")
        .limit(size);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw new Error(`Could not read pending items: ${error.message}`);
      return (data ?? []) as WithPicture[];
    },
    async (item) => {
      const thumb = await buildThumb(item.image_url);
      const path = `items/${item.id}.webp`;
      // A Blob, never a raw Buffer (BUGCATCHER #1).
      const blob = new Blob([new Uint8Array(thumb)], { type: "image/webp" });
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: true });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);

      const { data: publicUrl } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: updateError } = await items()
        .update({ thumb_url: publicUrl.publicUrl })
        .eq("id", item.id);
      if (updateError) throw new Error(`db: ${updateError.message}`);
    },
  );
  report("Thumbnails uploaded", thumbs.succeeded, thumbs.failures);
  console.log();
}

main().catch((error) => {
  console.error("\nImage pass failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
