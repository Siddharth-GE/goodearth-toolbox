"use server";

// app/actions/ is for platform-level concerns shared by every tool
// (today: just login/logout) — not where a tool's own actions go.
// Tool-specific actions belong in lib/<tool>/actions.ts instead,
// alongside that tool's queries.ts (see lib/marathon/actions.ts).

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type LoginState = { error?: string } | undefined;

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Incorrect email or password." };
  }

  // The credentials are right, but the account may have been switched
  // off. Signing them straight back out is clearer than letting them in
  // to a dashboard where every screen redirects (0032).
  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: "This account has been deactivated. Ask an admin to switch it back on." };
    }
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
