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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDeck } from "@/lib/dexter/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { sendUpload } from "./send-upload";

// uploadDeck takes (projectId, formData), not useActionState's (prevState, formData), so the form
// is read by hand on submit.
export function UploadDeckDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Upload a deck</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a deck</DialogTitle>
        </DialogHeader>
        {/* Radix unmounts DialogContent on close, so every open starts clean. */}
        <UploadDeckForm projectId={projectId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function UploadDeckForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setBusy(true);
        setError(undefined);
        const result = await sendUpload(formData, (data) => uploadDeck(projectId, data));
        setBusy(false);
        if (result?.error) {
          setError(result.error);
          return;
        }
        router.refresh();
        onDone();
      }}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="deck-title">Title</Label>
          <Input
            id="deck-title"
            name="title"
            required
            maxLength={120}
            autoFocus
            placeholder="e.g. Working drawings v2"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deck-file">File</Label>
          <Input id="deck-file" name="file" type="file" accept=".html,.htm,.zip" required />
          <p className="text-muted text-xs">
            One HTML file, or a zip with index.html at its top level. Up to 4 MB.
          </p>
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{busy ? "Uploading…" : "Upload"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}
