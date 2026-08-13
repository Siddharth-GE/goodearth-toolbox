"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { deleteFacility, setFacilityActive } from "@/lib/financial-management/actions";
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Close/reopen and Delete for one facility. Delete asks first and is
 * refused by the action (and the RESTRICT FK behind it) once the
 * facility has movements — the menu offers Close for that case.
 *
 * Plain useState booleans rather than useTransition — the Relay
 * schedule-editor bug (see PlanRowMenu).
 */
export function FacilityMenu({
  facilityId,
  party,
  isActive,
}: {
  facilityId: string;
  party: string;
  isActive: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onToggleActive() {
    setBusy(true);
    setError(undefined);
    const result = await setFacilityActive(facilityId, !isActive);
    setBusy(false);
    if (result?.error) setError(result.error);
  }

  async function onDelete() {
    setBusy(true);
    setError(undefined);
    const result = await deleteFacility(facilityId);
    // Only reached when the action returned instead of redirecting.
    setBusy(false);
    if (result?.error) setError(result.error);
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <FormMessage error={error} size="xs" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={`Actions for ${party}`} size="sm" disabled={busy}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onToggleActive}>
              {isActive ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
              {isActive ? "Close facility" : "Reopen facility"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this facility?</DialogTitle>
            <DialogDescription>
              “{party}” will be removed. A facility with recorded movements can&rsquo;t be deleted —
              close it instead, and its history stays.
            </DialogDescription>
          </DialogHeader>
          <FormMessage error={error} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button onClick={onDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete facility"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
