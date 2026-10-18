"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/lib/action-state";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { setActive, setAdmin } from "@/lib/settings/actions";
import { useState } from "react";

type Confirming = "admin" | "active" | null;

/** Both ask first, inline, being consequential. The database refuses the dangerous cases regardless (profiles_guard, 0032);
 * these make the refusal a sentence. */
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
  const { pending, error, run: runAction } = useActionRunner();
  const [confirming, setConfirming] = useState<Confirming>(null);

  const run = async (fn: () => Promise<ActionState>) => {
    await runAction(fn);
    setConfirming(null);
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
