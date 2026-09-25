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
import {
  deleteDeck,
  renameDeck,
  replaceDeckFile,
  reissueDeckLink,
  setDeckSharing,
} from "@/lib/dexter/actions";
import {
  Copy,
  ExternalLink,
  Link2,
  Link2Off,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { sendUpload } from "./send-upload";

export type DexterDeckActionRow = {
  id: string;
  title: string;
  entryPath: string;
  shareToken: string;
  shareEnabled: boolean;
};

/**
 * Every per-deck action, in one dropdown: open, copy, rename, replace
 * the file, toggle the link, issue a new one, delete.
 *
 * Plain useState booleans rather than useTransition throughout — a
 * router.refresh() inside an async transition leaves isPending true for
 * as long as the refresh is in flight, which greys the row out and never
 * comes back (the Relay schedule-editor bug).
 */
export function DeckActions({ deck }: { deck: DexterDeckActionRow }) {
  const router = useRouter();
  const path = `/deck/${deck.shareToken}/${deck.entryPath}`;

  const [renaming, setRenaming] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string>();

  async function onCopy() {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setFallbackUrl(undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallbackUrl(url);
    }
  }

  async function onToggleSharing() {
    setBusy(true);
    setError(undefined);
    const result = await setDeckSharing(deck.id, !deck.shareEnabled);
    setBusy(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  async function onReissue() {
    if (!window.confirm("Make a new link? The current link will stop working immediately.")) {
      return;
    }
    setBusy(true);
    setError(undefined);
    const result = await reissueDeckLink(deck.id);
    setBusy(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  async function onDelete() {
    if (!window.confirm(`Delete "${deck.title}"? This can't be undone.`)) return;
    setBusy(true);
    setError(undefined);
    const result = await deleteDeck(deck.id);
    setBusy(false);
    if (result?.error) setError(result.error);
    else router.refresh();
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <FormMessage error={error} success={copied ? "Copied" : undefined} size="xs" />
        {fallbackUrl && (
          <Input
            readOnly
            value={fallbackUrl}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Deck link"
            className="h-8 w-56 text-xs"
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={`Actions for ${deck.title}`} size="sm" disabled={busy}>
              <MoreHorizontal className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={path} target="_blank" rel="noopener">
                <ExternalLink className="size-4" />
                Open link
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void onCopy();
              }}
            >
              <Copy className="size-4" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setReplacing(true)}>
              <Upload className="size-4" />
              Replace file
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onToggleSharing}>
              {deck.shareEnabled ? <Link2Off className="size-4" /> : <Link2 className="size-4" />}
              {deck.shareEnabled ? "Link off" : "Link on"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onReissue}>
              <RefreshCw className="size-4" />
              New link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger" onSelect={onDelete}>
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename this deck</DialogTitle>
          </DialogHeader>
          {/* Inside DialogContent, which Radix unmounts on close, so every
              open starts from the saved title with no stale error. */}
          <RenameDeckForm
            deckId={deck.id}
            title={deck.title}
            onDone={() => {
              setRenaming(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={replacing} onOpenChange={setReplacing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace the file</DialogTitle>
          </DialogHeader>
          <ReplaceDeckFileForm
            deckId={deck.id}
            onDone={() => {
              setReplacing(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function RenameDeckForm({
  deckId,
  title,
  onDone,
}: {
  deckId: string;
  title: string;
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
        const result = await renameDeck(deckId, String(formData.get("title") ?? ""));
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
          <Label htmlFor="deck-rename-title">Title</Label>
          <Input
            id="deck-rename-title"
            name="title"
            defaultValue={title}
            required
            maxLength={120}
            autoFocus
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

function ReplaceDeckFileForm({ deckId, onDone }: { deckId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setBusy(true);
        setError(undefined);
        const result = await sendUpload(formData, (data) => replaceDeckFile(deckId, data));
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
          <Label htmlFor="deck-replace-file">File</Label>
          <Input
            id="deck-replace-file"
            name="file"
            type="file"
            accept=".html,.htm,.zip"
            required
            autoFocus
          />
          <p className="text-muted text-xs">
            The link stays the same — only what it opens changes.
          </p>
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{busy ? "Uploading…" : "Replace"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}
