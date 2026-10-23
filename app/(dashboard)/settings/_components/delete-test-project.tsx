"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteTestProject } from "@/lib/settings/test-project-actions";
import { Trash2 } from "lucide-react";

/** The one big red button: asks once, then the database deletes everything under the test project. */
export function DeleteTestProject({ projectId, name }: { projectId: string; name: string }) {
  return (
    <ConfirmDialog
      trigger={
        <Button
          size="lg"
          className="bg-danger text-danger-foreground hover:bg-danger/90 w-full sm:w-auto"
        >
          <Trash2 className="size-5" aria-hidden />
          Delete the test project
        </Button>
      }
      title={`Delete ${name} and everything in it?`}
      description="Its villa, estimate, indents, POs, deliveries, stock, issues, bills, labour, stages, checklists and drawings all go, for good. Nothing outside it is touched."
      confirmLabel="Delete it all"
      pendingLabel="Deleting…"
      onConfirm={() => deleteTestProject(projectId)}
    />
  );
}
