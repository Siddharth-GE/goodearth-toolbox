"use client";

import { DeleteOrCancel } from "@/components/ui/delete-or-cancel";
import type { ActionState } from "@/lib/action-state";
import { createContext, useContext, type ReactNode } from "react";

/** Whether the viewer is an admin, the only one who deletes a master (0150). Cosmetic: the policy is the boundary. */
const MastersAdmin = createContext(false);

export function MastersAdminProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: ReactNode;
}) {
  return <MastersAdmin.Provider value={isAdmin}>{children}</MastersAdmin.Provider>;
}

export function useMastersAdmin(): boolean {
  return useContext(MastersAdmin);
}

/** A row's Delete, for a master edited in place rather than in a dialog. */
export function MasterDeleteButton({
  noun,
  onDelete,
}: {
  noun: string;
  onDelete: () => Promise<ActionState>;
}) {
  const isAdmin = useMastersAdmin();
  if (!isAdmin) return null;
  return (
    <DeleteOrCancel
      noun={noun}
      removal={{ kind: "delete" }}
      onDelete={onDelete}
      deleteNote="It goes for good, only while nothing uses it. If something does, you'll be told what, and nothing changes."
    />
  );
}
