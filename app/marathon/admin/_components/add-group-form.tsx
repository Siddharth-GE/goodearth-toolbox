"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroup, type CreateGroupState } from "@/lib/marathon/actions";
import { useActionState } from "react";

export function AddGroupForm() {
  const [state, formAction, pending] = useActionState<CreateGroupState, FormData>(
    createGroup,
    undefined,
  );

  return (
    <form
      action={formAction}
      className="border-border bg-surface space-y-3 rounded-2xl border p-3.5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="group-name">Group name</Label>
        <Input id="group-name" name="name" required maxLength={120} autoComplete="off" />
      </div>
      <FormMessage error={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add Group"}
      </Button>
    </form>
  );
}
