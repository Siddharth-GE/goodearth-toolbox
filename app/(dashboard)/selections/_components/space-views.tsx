"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  captionSpaceView,
  deleteSpaceView,
  moveSpaceView,
  uploadSpaceView,
} from "@/lib/selections/views-actions";
import { designView } from "@/lib/pdf/theme";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import type { SpaceViewRow } from "@/lib/design-views/queries";
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

/** Normalise to the document spec before upload: Server Actions cap the body at ~1MB, so a big render never arrives. The server re-normalises anyway (an action is a public endpoint). */
async function normaliseForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = designView.width;
    canvas.height = designView.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");

    // Letterbox on white, not crop, same as the server.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, designView.contentType, designView.quality / 100),
    );
    if (!blob) throw new Error("encode failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

/** Every image is normalised to 16:9 on upload (lib/pdf/theme.ts), so the strip previews the client document. */
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
      // Sequential: Server Actions dispatch one at a time per client anyway; keeps the order predictable.
      for (const file of Array.from(files)) {
        let normalised: Blob;
        try {
          normalised = await normaliseForUpload(file);
        } catch {
          // Usually a format the browser can't decode, e.g. HEIC from an iPhone.
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
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
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
              {uploading ? (
                <Spinner className="size-4 border-2" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {uploading ? "Uploading…" : "Add views"}
            </Button>
          </>
        )}
      </div>

      <FormMessage error={error} size="xs" />

      {views.length === 0 ? (
        editable && (
          <p className="border-border text-muted rounded-xl border border-dashed px-4 py-6 text-center text-sm">
            Renders and elevations for this space. They appear on the client&apos;s document, and
            are cropped to a consistent landscape shape so every page reads the same.
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
  // Shared hook: it advances "already saved" only after the server confirms, so a failed save retries on the next blur.
  const captionSave = useSaveOnBlur<string>({
    initial: view.caption ?? "",
    save: (value) => captionSpaceView(view.id, selectionId, value),
  });

  return (
    <figure className={busy ? "opacity-50" : undefined}>
      <div className="border-border bg-surface overflow-hidden rounded-xl border">
        {/* Plain <img>: the route returns a normalised 16:9 JPEG, so next/image has nothing to optimise. */}
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
            onBlur={() => captionSave.flush(caption)}
            placeholder="Caption"
            className="h-8 text-xs"
            aria-label="Caption"
          />
          <IconButton
            aria-label="Move earlier"
            bordered
            disabled={isFirst || busy}
            onClick={() =>
              startTransition(async () => void (await moveSpaceView(view.id, selectionId, "up")))
            }
          >
            <ChevronLeft className="size-3.5" />
          </IconButton>
          <IconButton
            aria-label="Move later"
            bordered
            disabled={isLast || busy}
            onClick={() =>
              startTransition(async () => void (await moveSpaceView(view.id, selectionId, "down")))
            }
          >
            <ChevronRight className="size-3.5" />
          </IconButton>
          <IconButton
            aria-label="Remove this view"
            tone="danger"
            bordered
            disabled={busy}
            onClick={() => startTransition(async () => void (await deleteSpaceView(view.id)))}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      ) : (
        view.caption && (
          <figcaption className="text-muted mt-1.5 text-xs">{view.caption}</figcaption>
        )
      )}
      {editable && <FormMessage error={captionSave.error} size="xs" className="mt-1" />}
    </figure>
  );
}
