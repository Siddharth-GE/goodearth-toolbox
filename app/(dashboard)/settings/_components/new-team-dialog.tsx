"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeam } from "@/lib/settings/teams-actions";

/** A new team starts at the bottom of the sidebar with no tools — hidden until it has one. */
export function NewTeamDialog() {
  return (
    <RecordFormDialog label="Team" isEdit={false} action={createTeam}>
      <div className="space-y-1.5">
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          name="name"
          required
          maxLength={40}
          autoComplete="off"
          placeholder="e.g. Design"
        />
      </div>
      <p className="text-muted text-xs">Choose which tools sit under it after you create it.</p>
    </RecordFormDialog>
  );
}
