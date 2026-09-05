import { isCronAuthorized } from "@/lib/keep-alive";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The weekly keep-alive.
 *
 * Supabase's free tier pauses a project after seven days without a
 * request, and between releases nobody uses production — it happened
 * (SHIPPING.md, "Pausing"). The cron in vercel.json calls this once a
 * week on the production deployment; the one-row read below is the
 * request that keeps the database awake.
 *
 * Gate: Vercel sends `Authorization: Bearer <CRON_SECRET>` with every
 * cron call, and nothing else may run this. A missing CRON_SECRET is a
 * loud 503 rather than an open route, so a forgotten variable shows up
 * in the cron log instead of silently letting anyone in.
 *
 * The read goes through the admin client because a cron has no session
 * — a sanctioned shell exception (SECURITY.md). It reads one filename
 * from applied_migrations, a table with nothing sensitive in it, and
 * returns nothing else.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ ok: false, reason: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("applied_migrations")
    .select("filename")
    .order("filename", { ascending: false })
    .limit(1);

  if (error) {
    console.error("keep-alive: the database did not answer", error);
    return Response.json({ ok: false, reason: error.message }, { status: 502 });
  }

  return Response.json({
    ok: true,
    latestMigration: data[0]?.filename ?? null,
    at: new Date().toISOString(),
  });
}
