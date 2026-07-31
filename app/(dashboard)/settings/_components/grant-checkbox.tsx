"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { grantApp, revokeApp } from "@/lib/settings/actions";
import { useTransition } from "react";

export function GrantCheckbox({
  userId,
  app,
  granted,
}: {
  userId: string;
  app: string;
  granted: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Checkbox
      defaultChecked={granted}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.checked;
        startTransition(async () => {
          if (next) {
            await grantApp(userId, app);
          } else {
            await revokeApp(userId, app);
          }
        });
      }}
    />
  );
}
