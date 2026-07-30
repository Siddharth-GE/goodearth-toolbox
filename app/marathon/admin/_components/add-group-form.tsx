"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroup, type CreateGroupState } from "@/lib/marathon/actions";
import { useActionState } from "react";

export function AddGroupForm() {
  const [state, formAction, pending] = useActionState<CreateGroupState, FormData>(createGroup, undefined);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-surface p-3.5">
      <div className="space-y-1.5">
        <Label htmlFor="group-name">Group name</Label>
        <Input id="group-name" name="name" required maxLength={120} autoComplete="off" />
      </div>
      {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add Group"}
      </Button>
    </form>
  );
}
