"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { setActive, setAdmin } from "@/lib/settings/actions";
import { useState, useTransition } from "react";

type Confirming = "admin" | "active" | null;

/**
 * The two switches that change what a person IS rather than what they
 * can open. Both ask first, in the app's own inline style (the bills
 * delete pattern) rather than a browser dialog — consequential, and
 * neither should be a stray click.
 *
 * The database refuses the dangerous cases regardless (profiles_guard,
 * 0032); these just make the refusal arrive as a sentence.
 */
export function AccountSwitches({
  userId,
  isAdmin,
  isActive,
  isSelf,
}: {
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string>();

  const run = (fn: () => Promise<{ error?: string } | undefined>) => {
    setError(undefined);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      setConfirming(null);
    });
  };

  if (isSelf) {
    return (
      <p className="text-muted text-sm">
        This is your own account — another admin changes your admin status or switches it off.
      </p>
    );
  }

  if (confirming === "admin") {
    return (
      <div className="space-y-2">
        <p className="text-foreground text-sm">
          {isAdmin
            ? "Remove admin access? They keep only the apps ticked below."
            : "Make this person an admin? Admins can open every app and change everyone's access."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            className={isAdmin ? "text-danger" : undefined}
            disabled={pending}
            onClick={() => run(() => setAdmin(userId, !isAdmin))}
          >
            {pending ? "Saving…" : isAdmin ? "Remove admin" : "Make admin"}
          </Button>
        </div>
        <FormMessage error={error} size="xs" />
      </div>
    );
  }

  if (confirming === "active") {
    return (
      <div className="space-y-2">
        <p className="text-foreground text-sm">
          {isActive
            ? "Switch off this account? They won't be able to sign in. Nothing they have done is deleted, and you can switch it back on."
            : "Switch this account back on? They will be able to sign in again, with their apps as they were."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            className={isActive ? "text-danger" : undefined}
            disabled={pending}
            onClick={() => run(() => setActive(userId, !isActive))}
          >
            {pending ? "Saving…" : isActive ? "Deactivate account" : "Reactivate account"}
          </Button>
        </div>
        <FormMessage error={error} size="xs" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming("admin")}>
          {isAdmin ? "Remove admin" : "Make admin"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirming("active")}>
          {isActive ? "Deactivate account" : "Reactivate account"}
        </Button>
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
