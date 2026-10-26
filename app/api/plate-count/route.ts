import { getCurrentUser } from "@/lib/auth/dal";
import { getMyPlate, plateCount } from "@/lib/overview/plate";

/**
 * The bell's count. A GET, not a Server Action: actions run one at a time per client, so a count reading every tool
 * would hold up the person's next save. Behind the sign-in like every page; never cached, as it is one person's.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const count = plateCount(await getMyPlate());
  return Response.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
}
