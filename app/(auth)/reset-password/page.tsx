import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Where the emailed link ends up, holding a recovery session minted by
 * /auth/confirm. Deliberately NOT requireUser(): this page must stay
 * reachable for a session that hasn't been through the 2FA code step —
 * the whole point of a reset is that the person may hold nothing but
 * their inbox.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <Logo className="mb-4 size-11" />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">Set a new password</h1>
        <p className="text-muted mt-1 text-sm">
          For {user.email}. Changing it signs you out everywhere.
        </p>
      </div>
      <ResetPasswordForm />
    </Card>
  );
}
