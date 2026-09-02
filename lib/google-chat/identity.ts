import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { senderEmail, type ChatEvent } from "./events";
import { decideIdentity, type Identity } from "./identity-rules";

/**
 * Who typed this? The door's second trust step: a verified Google email
 * turned into a toolbox account, or one of five polite refusals.
 *
 * The two reads live here; the decision they feed lives in
 * identity-rules.ts, pure and fully tested. This half only fetches.
 *
 * Admin-client use, sanctioned in SECURITY.md: the door has no browser
 * session at all (Google posts straight to it), so the email lookup and
 * the profile-and-grants read go through createAdminClient. Both are
 * reads of shell-owned tables and the only thing that leaves this file
 * is a decision — the same shape as markSessionVerified. No session is
 * minted here; acting AS the person is Phase 6.
 *
 * Two things that never happen: the email is never logged or echoed,
 * and nothing here reports more about who exists in the system than the
 * five fixed sentences in cards.ts.
 */

export type { Identity };

/**
 * The I/O half: Google's event in, a decision out. Never throws — the
 * door must always answer with a card — and never logs the email.
 */
export async function resolveIdentity(event: ChatEvent): Promise<Identity> {
  const email = senderEmail(event);
  if (!email) return { kind: "no-email" };

  try {
    const admin = createAdminClient();

    // perPage is load-bearing: the default page is 50, and quietly
    // returning page one of ~70 accounts would tell real colleagues
    // "I don't know you yet" depending on when they signed up.
    const { data: userPage, error: usersError } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (usersError) {
      console.error("google-chat identity: auth user lookup failed", usersError);
      return { kind: "failed" };
    }

    const authUser =
      (userPage?.users ?? []).find((user) => (user.email ?? "").trim().toLowerCase() === email) ??
      null;
    if (!authUser) return decideIdentity(email, null, null);

    // The same select getCurrentUser uses, minus the columns the door
    // has no use for. The FK is named: `roles` also carries created_by
    // and updated_by pointing back at profiles (0034), so a bare
    // `roles(…)` is ambiguous and PostgREST refuses it outright
    // (BUGCATCHER #2).
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select(
        "id, full_name, role, is_active, user_apps(app), roles!profiles_role_id_fkey(role_apps(app))",
      )
      .eq("id", authUser.id)
      .maybeSingle();
    if (profileError) {
      console.error("google-chat identity: profile read failed", profileError);
      return { kind: "failed" };
    }
    if (!profile) return decideIdentity(email, { id: authUser.id }, null);

    // Effective access is the union of the personal grants and the role
    // bundle's, computed per request exactly as getCurrentUser does, so
    // editing a role takes effect in chat immediately too.
    const personalApps = (profile.user_apps ?? []).map((row) => row.app);
    const roleApps = (profile.roles?.role_apps ?? []).map((row) => row.app);

    return decideIdentity(
      email,
      { id: authUser.id },
      {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active,
        apps: [...new Set([...personalApps, ...roleApps])],
      },
    );
  } catch (error) {
    // Anything unforeseen — the service key unset, the network gone —
    // is still an answer in chat, never an exception out of the door.
    console.error("google-chat identity: lookup broke", error);
    return { kind: "failed" };
  }
}
