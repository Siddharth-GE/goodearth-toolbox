"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  captionSpaceView,
  deleteSpaceView,
  moveSpaceView,
  uploadSpaceView,
} from "@/lib/selections/views-actions";
import { designView } from "@/lib/pdf/theme";
import type { SpaceViewRow } from "@/lib/selections/views";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

/**
 * Normalises an image to the document spec *before* it leaves the browser.
 *
 * Not an optimisation — a necessity. Server Actions cap the request body
 * at 1MB, and hosting caps it not much higher, so an 8MB render never
 * reaches the server at all. Resizing here sends ~300KB instead, which
 * also makes uploads bearable on a site connection.
 *
 * The server re-normalises what arrives regardless: an action is a public
 * endpoint, so nothing a browser sends can be trusted to already be the
 * right shape.
 */
async function normaliseForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = designView.width;
    canvas.height = designView.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");

    // Letterbox on white rather than crop — same rule as the server.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, designView.contentType, designView.quality / 100),
    );
    if (!blob) throw new Error("encode failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * The renders and elevations for one space.
 *
 * Every image is normalised to 16:9 on upload (lib/pdf/theme.ts), so the
 * strip below is a true preview of how the space will read on the client
 * document rather than an approximation of it.
 */
export function SpaceViews({
  spaceId,
  selectionId,
  views,
  editable,
}: {
  spaceId: string;
  selectionId: string;
  views: SpaceViewRow[];
  editable: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [error, setError] = useState<string>();

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(undefined);
    startUpload(async () => {
      // Sequential, not Promise.all: Server Actions dispatch one at a
      // time per client anyway, and this keeps the order predictable.
      for (const file of Array.from(files)) {
        let normalised: Blob;
        try {
          normalised = await normaliseForUpload(file);
        } catch {
          // Usually a format the browser can't decode — HEIC straight off
          // an iPhone is the common one.
          setError(`Couldn't read “${file.name}”. Export it as JPG or PNG and try again.`);
          break;
        }

        const formData = new FormData();
        formData.set("file", new File([normalised], file.name, { type: designView.contentType }));
        const outcome = await uploadSpaceView(spaceId, selectionId, formData);
        if (outcome?.error) {
          setError(outcome.error);
          break;
        }
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  if (!editable && views.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Views {views.length > 0 && `(${views.length})`}
        </p>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              hidden
              onChange={(event) => upload(event.target.files)}
            />
            <Button
              variant="secondary"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {uploading ? "Uploading…" : "Add views"}
            </Button>
          </>
        )}
      </div>

      {error && <p className="text-xs font-medium text-danger">{error}</p>}

      {views.length === 0 ? (
        editable && (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            Renders and elevations for this space. They appear on the client&apos;s document, and are
            cropped to a consistent landscape shape so every page reads the same.
          </p>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {views.map((view, index) => (
            <ViewCard
              key={view.id}
              view={view}
              selectionId={selectionId}
              editable={editable}
              isFirst={index === 0}
              isLast={index === views.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ViewCard({
  view,
  selectionId,
  editable,
  isFirst,
  isLast,
}: {
  view: SpaceViewRow;
  selectionId: string;
  editable: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [caption, setCaption] = useState(view.caption ?? "");
  const [busy, startTransition] = useTransition();
  const saved = useRef(view.caption ?? "");

  const saveCaption = () => {
    if (caption === saved.current) return;
    saved.current = caption;
    void captionSpaceView(view.id, selectionId, caption);
  };

  return (
    <figure className={busy ? "opacity-50" : undefined}>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {/* Plain <img>: the route handler is same-origin and already
            returns a normalised 16:9 JPEG, so there is nothing for
            next/image to optimise. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/selections/views/${view.id}`}
          alt={view.caption ?? "Design view"}
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      </div>

      {editable ? (
        <div className="mt-1.5 flex items-center gap-1">
          <Input
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            onBlur={saveCaption}
            placeholder="Caption"
            className="h-8 text-xs"
            aria-label="Caption"
          />
          <IconButton
            label="Move earlier"
            disabled={isFirst || busy}
            onClick={() => startTransition(async () => void (await moveSpaceView(view.id, selectionId, "up")))}
          >
            <ChevronLeft className="size-3.5" />
          </IconButton>
          <IconButton
            label="Move later"
            disabled={isLast || busy}
            onClick={() =>
              startTransition(async () => void (await moveSpaceView(view.id, selectionId, "down")))
            }
          >
            <ChevronRight className="size-3.5" />
          </IconButton>
          <IconButton
            label="Remove this view"
            disabled={busy}
            danger
            onClick={() => startTransition(async () => void (await deleteSpaceView(view.id, selectionId)))}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ) : (
        view.caption && <figcaption className="mt-1.5 text-xs text-muted">{view.caption}</figcaption>
      )}
    </figure>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border transition-colors disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        danger
          ? "text-muted hover:bg-danger/10 hover:text-danger"
          : "text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
