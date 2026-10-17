import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { senderEmail, type ChatEvent } from "./events";
import { decideIdentity, type Identity } from "./identity-rules";

// Admin client, sanctioned in SECURITY.md: the door has no browser session, so the email lookup
// and profile-and-grants read use createAdminClient. They read shell-owned tables and only a
// decision leaves this file. The email is never logged or echoed, and nothing reveals more about
// who exists than cards.ts's five sentences.

export type { Identity };

export async function resolveIdentity(event: ChatEvent): Promise<Identity> {
  const email = senderEmail(event);
  if (!email) return { kind: "no-email" };

  try {
    const admin = createAdminClient();

    // perPage is load-bearing: the default 50 would tell real colleagues "I don't know you yet".
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

    // The FK is named: `roles` also has created_by/updated_by to profiles (0034), so a bare embed
    // is ambiguous (BUGCATCHER #2).
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

    // Union of personal and role grants, per request as getCurrentUser does.
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
    // Anything unforeseen is still an answer in chat.
    console.error("google-chat identity: lookup broke", error);
    return { kind: "failed" };
  }
}
