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
import { deletePlan, duplicatePlan } from "@/lib/business-planning/actions";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Duplicate and Delete for one row of the list.
 *
 * Duplicate redirects into the copy, so this component unmounts and
 * `busy` never has to be cleared. Delete stays on the page and calls
 * router.refresh(), and deliberately asks first — a plan is the only
 * copy of a piece of thinking.
 *
 * Plain useState booleans rather than useTransition: router.refresh()
 * inside an async transition leaves isPending true for as long as the
 * refresh is in flight, which greys the row out and never comes back
 * (the Relay schedule-editor bug).
 */
export function PlanRowMenu({ planId, planName }: { planId: string; planName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onDuplicate() {
    setBusy(true);
    setError(undefined);
    const result = await duplicatePlan(planId);
    // Only reached when the action returned instead of redirecting.
    setBusy(false);
    if (result?.error) setError(result.error);
  }

  async function onDelete() {
    setBusy(true);
    setError(undefined);
    const result = await deletePlan(planId);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <FormMessage error={error} size="xs" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={`Actions for ${planName}`} size="sm" disabled={busy}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy className="size-4" />
              Duplicate
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
            <DialogTitle>Delete this plan?</DialogTitle>
            <DialogDescription>
              “{planName}” and every line in it will be removed. This can&rsquo;t be undone from
              here.
            </DialogDescription>
          </DialogHeader>
          <FormMessage error={error} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button onClick={onDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
