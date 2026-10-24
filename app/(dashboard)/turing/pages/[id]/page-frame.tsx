"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { deletePage } from "@/lib/turing/actions";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * The page in a sandboxed frame: scripts run, on an opaque origin with no network (the view
 * route's CSP says the same). Reload reads the data afresh; no Claude, no cost. A frame that
 * loads twice has navigated itself somewhere else — the one thing the CSP cannot stop — so it
 * is taken away and the admin is told.
 */
export function PageFrame({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [loads, setLoads] = useState(0);
  const [left, setLeft] = useState(false);
  const loaded = useRef(0);
  const src = `/turing/pages/${id}/view`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            loaded.current = 0;
            setLeft(false);
            setLoads((n) => n + 1);
          }}
        >
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
      {left ? (
        <FormMessage error="This page tried to open something outside the toolbox, so it was closed. Delete it, and tell the founder." />
      ) : (
        <iframe
          key={loads}
          src={src}
          title={title}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          onLoad={() => {
            loaded.current += 1;
            if (loaded.current > 1) setLeft(true);
          }}
          className="border-border bg-surface-raised h-[75vh] w-full rounded-2xl border"
        />
      )}
    </div>
  );
}
