"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { declineSiteRequest } from "@/lib/inventory/actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

export function DeclineRequestDialog({ requestId, what }: { requestId: string; what: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, error, run, clearError } = useActionRunner();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setReason("");
          clearError();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Decline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this request</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="decline-reason">Why? The supervisor sees this at site.</Label>
          <Textarea
            id="decline-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={`e.g. No stock — raise an indent for ${what}.`}
          />
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            variant="primary"
            disabled={pending || !reason.trim()}
            onClick={async () => {
              const result = await run(() => declineSiteRequest(requestId, reason));
              if (!result?.error) {
                setOpen(false);
              }
            }}
          >
            Decline request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
