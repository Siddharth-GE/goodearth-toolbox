"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deletePage } from "@/lib/turing/actions";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The page in a sandboxed frame: scripts run, on an opaque origin with no network (the view
 * route's CSP says the same). Reload reads the data afresh; no Claude, no cost.
 */
export function PageFrame({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [loads, setLoads] = useState(0);
  const src = `/turing/pages/${id}/view`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setLoads((n) => n + 1)}>
          <RefreshCw className="size-4" aria-hidden />
          Reload
        </Button>
        <LinkButton href={`${src}?download`} variant="secondary" size="sm" plain>
          <Download className="size-4" aria-hidden />
          Download
        </LinkButton>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          }
          title="Delete this page?"
          description="It goes for every admin. The conversation that made it stays."
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            const result = await deletePage(id);
            if (!result?.error) router.push("/turing/pages");
            return result;
          }}
        />
      </div>
      <iframe
        key={loads}
        src={src}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="border-border h-[75vh] w-full rounded-2xl border bg-white"
      />
    </div>
  );
}
