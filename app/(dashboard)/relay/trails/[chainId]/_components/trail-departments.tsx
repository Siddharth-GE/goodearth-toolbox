"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { setTrailDepartments } from "@/lib/relay/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DepartmentPicker } from "../../../_components/department-picker";

/**
 * Departments on an open trail: read-only chips until someone chooses to
 * change them, because most visits to this page are to move a baton, not
 * to re-tag it.
 *
 * Editable only while the trail is running. Once it is finished the
 * database refuses (0038 §3) — changing them then would silently rewrite
 * what every past report said.
 */
export function TrailDepartments({
  chainId,
  departments,
  selected,
  editable,
}: {
  chainId: string;
  departments: { id: string; name: string }[];
  selected: { id: string; name: string }[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [ids, setIds] = useState(selected.map((d) => d.id));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {selected.length === 0 ? (
          <span className="text-muted text-sm">No department yet</span>
        ) : (
          selected.map((d) => (
            <Badge key={d.id} variant="info">
              {d.name}
            </Badge>
          ))
        )}
        {editable && (
          <button
            type="button"
            onClick={() => {
              setIds(selected.map((d) => d.id));
              setEditing(true);
            }}
            className="text-muted hover:text-foreground text-xs font-medium underline underline-offset-2"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <DepartmentPicker
        departments={departments}
        selected={ids}
        onChange={setIds}
        disabled={pending}
      />
      <FormMessage error={error} />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setTrailDepartments(chainId, ids);
              if (result?.error) {
                setError(result.error);
                return;
              }
              router.refresh();
              setEditing(false);
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
