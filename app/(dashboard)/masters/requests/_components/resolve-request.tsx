"use client";

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
import type { CatalogueSearchResult } from "@/lib/selections/catalogue";
import { Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

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
  const [result, setResult] = useState<CatalogueSearchResult>({ items: [], total: 0, pageCount: 1 });
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/catalogue?q=${encodeURIComponent(search)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        setResult((await response.json()) as CatalogueSearchResult);
        setLoading(false);
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, search]);

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
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
            Is it already in the catalogue?
          </p>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the catalogue…"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
          {loading && candidates.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-muted">
              <Spinner className="size-5 border-2" />
            </div>
          ) : candidates.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              Nothing similar found — this looks genuinely new.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {candidates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted">
                      {item.code ?? "—"}
                      {item.brand_name && ` · ${item.brand_name}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() => run(() => mergeItemRequest(requestId, provisionalItemId, item.id))}
                  >
                    Same as this
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
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
              onClick={() => run(() => approveItemRequest(requestId, provisionalItemId, code || null))}
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
          <p className="text-xs text-muted">
            Merging keeps the original line intact — issued revisions can never be rewritten, so the
            provisional item stays as an alias pointing at the real one.
          </p>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
