"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteProject, renameProject } from "@/lib/dexter/actions";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Rename and delete for the project header. `renameProject` takes plain
 * arguments rather than a FormData action, so this reads the form by
 * hand on submit rather than using useActionState — the same shape as
 * lib/design-management's inline edits.
 *
 * Plain useState booleans rather than useTransition: router.refresh()
 * inside an async transition leaves isPending true for as long as the
 * refresh is in flight (the Relay schedule-editor bug).
 */
export function ProjectHeaderActions({
  project,
  deckCount,
}: {
  project: { id: string; name: string; clientName: string | null };
  deckCount: number;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const canDelete = deckCount === 0;

  async function onDelete() {
    if (!canDelete) return;
    if (!window.confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    setBusy(true);
    setError(undefined);
    const result = await deleteProject(project.id);
    setBusy(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    router.push("/dexter/projects");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRenaming(true)} disabled={busy}>
          <Pencil className="size-4" />
          Rename
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="text-danger"
          onClick={onDelete}
          disabled={busy || !canDelete}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {!canDelete && <p className="text-muted text-xs">Delete its decks first.</p>}
      <FormMessage error={error} size="xs" />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename this project</DialogTitle>
          </DialogHeader>
          {/* Inside DialogContent, which Radix unmounts on close, so every
              open starts from the saved values with no stale error. */}
          <RenameProjectForm
            projectId={project.id}
            name={project.name}
            clientName={project.clientName}
            onDone={() => {
              setRenaming(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RenameProjectForm({
  projectId,
  name,
  clientName,
  onDone,
}: {
  projectId: string;
  name: string;
  clientName: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setBusy(true);
        setError(undefined);
        const result = await renameProject(
          projectId,
          String(formData.get("name") ?? ""),
          String(formData.get("client_name") ?? "") || null,
        );
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
          <Label htmlFor="rename-project-name">Name</Label>
          <Input
            id="rename-project-name"
            name="name"
            defaultValue={name}
            required
            maxLength={120}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rename-project-client">Client</Label>
          <Input
            id="rename-project-client"
            name="client_name"
            defaultValue={clientName ?? ""}
            maxLength={120}
            placeholder="Optional"
          />
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}
