"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { deleteConversation } from "@/lib/turing/actions";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function DeleteConversation({
  id,
  title,
  active,
}: {
  id: string;
  title: string;
  active: boolean;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <IconButton aria-label={`Delete ${title}`} tone="danger" size="sm">
          <Trash2 className="size-3.5" />
        </IconButton>
      }
      title="Delete this conversation?"
      description="Its messages and the files dropped into it go for good. Pages it made stay, for every admin."
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      onConfirm={async () => {
        const result = await deleteConversation(id);
        if (!result?.error && active) router.push("/turing");
        return result;
      }}
    />
  );
}
