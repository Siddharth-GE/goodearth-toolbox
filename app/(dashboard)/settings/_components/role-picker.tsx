"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { setPersonRole } from "@/lib/settings/roles-actions";
import { useState, useTransition } from "react";

/** Assigning someone's role — saves on change, rolls back if refused. */
export function RolePicker({
  userId,
  roleId,
  roles,
}: {
  userId: string;
  roleId: string | null;
  roles: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(roleId ?? "");
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-1">
      <Select
        value={value}
        disabled={isPending}
        aria-label="Role"
        className="max-w-56"
        onChange={(event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          setError(undefined);
          startTransition(async () => {
            const result = await setPersonRole(userId, next);
            if (result?.error) {
              setValue(previous);
              setError(result.error);
            }
          });
        }}
      >
        <option value="">No role</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </Select>
      <FormMessage error={error} size="xs" />
    </div>
  );
}
