"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action-state";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import type { ToolTeam } from "@/lib/nav/arrange";
import { deleteTeam, moveTeam, renameTeam } from "@/lib/settings/teams-actions";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";

/** Deleting a team never touches anyone's access: its tools only move to Other. */
export function TeamRow({
  team,
  toolCount,
  isFirst,
  isLast,
}: {
  team: ToolTeam;
  toolCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { pending, error, run: runAction } = useActionRunner();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const run = async (work: () => Promise<ActionState>) => {
    await runAction(work);
    setConfirmingDelete(false);
  };

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1">
          <IconButton
            aria-label={`Move ${team.name} up`}
            size="sm"
            disabled={isFirst || pending}
            onClick={() => run(() => moveTeam(team.id, "up"))}
          >
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton
            aria-label={`Move ${team.name} down`}
            size="sm"
            disabled={isLast || pending}
            onClick={() => run(() => moveTeam(team.id, "down"))}
          >
            <ArrowDown className="size-4" />
          </IconButton>
        </div>

        {/* min-w-32: Rename and Delete wrap before the name is cut short on a phone. */}
        <div className="min-w-32 flex-1">
          <p className="text-foreground truncate text-sm font-medium">{team.name}</p>
          <p className="text-muted text-xs">
            {toolCount === 0
              ? "No tools yet — hidden from the sidebar"
              : `${toolCount} ${toolCount === 1 ? "tool" : "tools"}`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <RecordFormDialog
            label="Team"
            isEdit
            action={renameTeam.bind(null, team.id)}
            trigger={
              <Button variant="ghost" size="sm" disabled={pending}>
                Rename
              </Button>
            }
          >
            <div className="space-y-1.5">
              <Label htmlFor={`team-name-${team.id}`}>Team name</Label>
              <Input
                id={`team-name-${team.id}`}
                name="name"
                defaultValue={team.name}
                required
                maxLength={40}
                autoComplete="off"
              />
            </div>
          </RecordFormDialog>
          {!confirmingDelete && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted text-xs">
            Delete {team.name}?{" "}
            {toolCount === 0
              ? "It has no tools."
              : `Its ${toolCount === 1 ? "tool moves" : `${toolCount} tools move`} to Other.`}{" "}
            Nobody loses access.
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirmingDelete(false)}
          >
            Keep it
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="text-danger"
            disabled={pending}
            onClick={() => run(() => deleteTeam(team.id))}
          >
            {pending ? "Deleting…" : "Delete team"}
          </Button>
        </div>
      )}
      <FormMessage error={error} size="xs" />
    </li>
  );
}
