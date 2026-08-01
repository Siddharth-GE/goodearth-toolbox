import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Everything except genuine build output. The matcher used to also skip
// any path ending .svg/.png/.jpg/.jpeg/.gif/.webp, which was meant for
// files in /public — but a dynamic route segment can end in those
// characters too (/selections/views/anything.png), and on a skipped path
// nothing strips the x-user-id header that lib/auth/dal.ts trusts. The
// few static files under /public now cost one cookie check each, which is
// a fair price for the boundary holding everywhere.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
