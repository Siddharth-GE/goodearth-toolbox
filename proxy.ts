import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Everything but build output. Static-file extensions are NOT skipped: a dynamic
// segment can end in .png, and a skipped path keeps a forged x-user-id header.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
