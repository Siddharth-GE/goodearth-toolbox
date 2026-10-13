"use client";

import { Select } from "@/components/ui/select";
import type { ToolTeam } from "@/lib/nav/arrange";
import { setToolTeam } from "@/lib/settings/teams-actions";
import { useState, useTransition } from "react";

const OTHER = "";

/**
 * The team one tool sits under, saved on change. Controlled, like
 * GrantCheckbox: it shows what the server confirmed, and moves back if
 * the save fails.
 */
export function ToolTeamSelect({
  app,
  toolName,
  teamId,
  teams,
}: {
  app: string;
  toolName: string;
  teamId: string | null;
  teams: ToolTeam[];
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(teamId ?? OTHER);
  const [error, setError] = useState<string>();

  return (
    <div className="flex w-full flex-col gap-1 sm:w-56">
      <Select
        aria-label={`Team for ${toolName}`}
        value={value}
        disabled={isPending}
        className="h-10"
        onChange={(event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          setError(undefined);
          startTransition(async () => {
            const result = await setToolTeam(app, next === OTHER ? null : next);
            if (result?.error) {
              setValue(previous);
              setError(result.error);
            }
          });
        }}
      >
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
        <option value={OTHER}>No team (Other)</option>
      </Select>
      {error && (
        <span role="alert" className="text-danger text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
