import { ResetPasswordForm } from "@/components/reset-password-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/** Where the emailed link ends. Deliberately NOT requireUser(): the person may hold only a recovery session, no 2FA step. */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <h1 className="text-foreground font-display text-3xl font-medium">Set a new password</h1>
        <p className="text-muted mt-2 text-sm">
          For {user.email}. Changing it signs you out everywhere.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
