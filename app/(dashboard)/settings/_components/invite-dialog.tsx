"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteUser } from "@/lib/settings/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/settings/invite";

/**
 * Creating an account, in the same dialog shell every master uses — it
 * already handles the pending state, the double-submit and closing only
 * on a save that worked.
 */
export function InviteDialog() {
  return (
    <RecordFormDialog label="Person" isEdit={false} action={inviteUser}>
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Name</Label>
        <Input id="full_name" name="full_name" required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Starting password</Label>
        <Input
          id="password"
          name="password"
          required
          autoComplete="off"
          minLength={MIN_PASSWORD_LENGTH}
        />
        <p className="text-muted text-xs">
          Give this to them yourself — they can change it later. At least {MIN_PASSWORD_LENGTH}{" "}
          characters.
        </p>
      </div>
      <p className="text-muted text-xs">
        They can sign in straight away, but will see nothing until you give them an app.
      </p>
    </RecordFormDialog>
  );
}
