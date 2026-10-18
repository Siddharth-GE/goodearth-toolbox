"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { setPersonRole } from "@/lib/settings/roles-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

export function RolePicker({
  userId,
  roleId,
  roles,
}: {
  userId: string;
  roleId: string | null;
  roles: { id: string; name: string }[];
}) {
  const { pending: isPending, error, run } = useActionRunner();
  const [value, setValue] = useState(roleId ?? "");

  return (
    <div className="space-y-1">
      <Select
        value={value}
        disabled={isPending}
        aria-label="Role"
        className="max-w-56"
        onChange={async (event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);

          const result = await run(() => setPersonRole(userId, next));
          if (result?.error) {
            setValue(previous);
          }
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
