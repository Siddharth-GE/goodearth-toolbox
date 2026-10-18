import { isCronAuthorized } from "@/lib/keep-alive";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Weekly cron (vercel.json) so the free tier never pauses production. Gated by
 * CRON_SECRET; unset is a loud 503, never an open route. Admin client because a cron
 * has no session (SECURITY.md): it reads one migration filename and returns nothing.
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
