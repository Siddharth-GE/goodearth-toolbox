"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteReport, renameReport, updateReportSpec } from "@/lib/reporter/actions";
import { encodeSpec, type ReportSpec } from "@/lib/reporter/spec";

// "Save changes" shows only when the spec on screen differs from the stored one. Plain useState,
// not useTransition: router.refresh() inside an async transition leaves isPending true and greys
// the control out for good.
export function ReportActions({
  reportId,
  name,
  description,
  spec,
  changed,
  canDelete,
}: {
  reportId: string;
  name: string;
  description: string | null;
  spec: ReportSpec;
  changed: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function onSaveChanges() {
    setBusy(true);
    setError(undefined);
    const result = await updateReportSpec(reportId, encodeSpec(spec));
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    // The changes are now the report itself, so keeping them in the URL would mislead.
    router.push(`/reporter/${reportId}`);
  }

  async function onDelete() {
    setBusy(true);
    setError(undefined);
    const result = await deleteReport(reportId);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setConfirming(false);
    router.push("/reporter/saved");
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FormMessage error={error} size="xs" />
        {changed && (
          <Button variant="secondary" onClick={onSaveChanges} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={`Actions for ${name}`} size="sm" disabled={busy}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-danger" onSelect={() => setConfirming(true)}>
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename this report</DialogTitle>
          </DialogHeader>
          <RenameForm
            reportId={reportId}
            name={name}
            description={description}
            onDone={() => {
              setRenaming(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this report?</DialogTitle>
            <DialogDescription>
              “{name}” will be removed for everyone. The data it reads is untouched — only the saved
              question goes.
            </DialogDescription>
          </DialogHeader>
          <FormMessage error={error} />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </Button>
            <Button onClick={onDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenameForm({
  reportId,
  name,
  description,
  onDone,
}: {
  reportId: string;
  name: string;
  description: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      action={async (formData: FormData) => {
        setBusy(true);
        setError(undefined);
        const result = await renameReport(reportId, undefined, formData);
        setBusy(false);
        if (result?.error) {
          setError(result.error);
          return;
        }
        onDone();
      }}
    >
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rename-name">Name</Label>
          <Input
            id="rename-name"
            name="name"
            required
            maxLength={120}
            defaultValue={name}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rename-description">What it answers</Label>
          <Textarea
            id="rename-description"
            name="description"
            rows={2}
            maxLength={300}
            defaultValue={description ?? ""}
          />
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <Button type="submit">{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}
