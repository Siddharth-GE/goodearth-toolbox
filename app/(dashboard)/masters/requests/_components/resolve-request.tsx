"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  approveItemRequest,
  mergeItemRequest,
  rejectItemRequest,
} from "@/lib/masters/item-requests-actions";
import { useDebouncedSearch } from "@/lib/hooks/use-debounced-search";
import type { CatalogueSearchResult } from "@/lib/masters/catalogue";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";

/**
 * Resolving a request.
 *
 * The catalogue search runs immediately, seeded with the requested name,
 * because with 2,600 items already loaded most "new" items are existing
 * items under a different name. Making the duplicate check the first
 * thing on screen is the difference between a catalogue and a junk drawer.
 */
export function ResolveRequest({
  requestId,
  provisionalItemId,
  requestedName,
}: {
  requestId: string;
  provisionalItemId: string;
  requestedName: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(requestedName);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  // The shared hook, not this file's own copy — the hand-rolled version
  // here had already drifted (it flashed "Nothing similar found" for
  // 200ms before the first search returned, the exact symptom the hook's
  // docstring warns about).
  const { result, loading } = useDebouncedSearch<CatalogueSearchResult>({
    url: "/api/catalogue",
    params: { q: search },
    enabled: open,
    initial: { items: [], total: 0, pageCount: 1 },
  });

  const run = (work: () => Promise<{ error?: string } | undefined>) =>
    startSaving(async () => {
      const outcome = await work();
      if (outcome?.error) {
        setError(outcome.error);
        return;
      }
      setOpen(false);
    });

  // The provisional item is in the catalogue too, so it would otherwise
  // appear as a candidate to merge itself into.
  const candidates = result.items.filter((item) => item.id !== provisionalItemId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setSearch(requestedName);
        if (!next) setError(undefined);
      }}
    >
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Review
      </Button>
      <DialogContent className="flex h-[80vh] max-w-2xl flex-col gap-4">
        <DialogHeader className="mb-0">
          <DialogTitle>{requestedName}</DialogTitle>
        </DialogHeader>

        <div>
          <p className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">
            Is it already in the catalogue?
          </p>
          <div className="relative">
            <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the catalogue…"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </div>

        <div className="border-border min-h-0 flex-1 overflow-y-auto rounded-xl border">
          {loading && candidates.length === 0 ? (
            <div className="text-muted flex h-24 items-center justify-center">
              <Spinner className="size-5 border-2" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-muted p-4 text-sm">
              Nothing similar found — this looks genuinely new.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {candidates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{item.name}</p>
                    <p className="text-muted text-xs">
                      {item.code ?? "—"}
                      {item.brand_name && ` · ${item.brand_name}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() =>
                      run(() => mergeItemRequest(requestId, provisionalItemId, item.id))
                    }
                  >
                    Same as this
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-border space-y-2 border-t pt-3">
          <Label htmlFor="approve-code">Or accept it as a new catalogue item</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="approve-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Code, e.g. WALL338 (optional)"
              autoComplete="off"
              className="w-56"
            />
            <Button
              disabled={saving}
              onClick={() =>
                run(() => approveItemRequest(requestId, provisionalItemId, code || null))
              }
            >
              Accept
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => run(() => rejectItemRequest(requestId, provisionalItemId))}
            >
              Reject
            </Button>
          </div>
          <p className="text-muted text-xs">
            Merging keeps the original line intact — issued revisions can never be rewritten, so the
            provisional item stays as an alias pointing at the real one.
          </p>
          <FormMessage error={error} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
