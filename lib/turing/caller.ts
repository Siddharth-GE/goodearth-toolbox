import "server-only";

import { getCurrentUser } from "@/lib/auth/dal";
import { isVerified } from "@/lib/auth/verified-session";

type Caller = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * The routes' form of requireTuring: a fetch cannot follow a redirect to /login, so it gets a
 * status and a sentence. is_admin() on every table is the boundary that holds behind it.
 */
export async function turingCaller(): Promise<{ user: Caller } | { refused: Response }> {
  const user = await getCurrentUser();
  if (!user || !(await isVerified(user.id))) {
    return { refused: Response.json({ error: "Sign in again to use Turing." }, { status: 401 }) };
  }
  if (user.profile?.role !== "admin") {
    return { refused: Response.json({ error: "Turing is for admins." }, { status: 403 }) };
  }
  return { user };
}
