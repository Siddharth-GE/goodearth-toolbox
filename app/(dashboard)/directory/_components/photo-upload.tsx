"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { removeMyPhoto, uploadMyPhoto } from "@/lib/directory/actions";
import { staffPhoto } from "@/lib/directory/photo";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PersonPhoto } from "./person-photo";

/**
 * A phone camera photo is 3-8MB and the Server Action body cap is 4mb, so
 * an unresized upload from site NEVER REACHES THE SERVER — what the person
 * sees is an opaque error with nothing to act on. Resizing here is not an
 * optimisation, it is the thing that makes upload work at all. ~40KB goes
 * up instead, which also matters on a site connection.
 *
 * The server re-normalises regardless: an action is a public endpoint, so
 * nothing a browser sends can be trusted to already be the right shape.
 */
async function normaliseForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = staffPhoto.size;
    canvas.height = staffPhoto.size;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");

    // `cover`: fill the square from the centre and let the edges go.
    // A face cropped is better than a face letterboxed onto white.
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
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
      canvas.toBlob(resolve, staffPhoto.contentType, staffPhoto.quality / 100),
    );
    if (!blob) throw new Error("encode failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

export function PhotoUpload({
  personId,
  name,
  photoPath,
}: {
  personId: string;
  name: string;
  photoPath: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const choose = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      let blob: Blob;
      try {
        blob = await normaliseForUpload(file);
      } catch {
        setError("That file could not be read as a photo.");
        return;
      }

      const formData = new FormData();
      formData.append("file", new File([blob], "photo.jpg", { type: staffPhoto.contentType }));

      const result = await uploadMyPhoto(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
      // Clear the input, so choosing the same file twice still fires.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <PersonPhoto personId={personId} name={name || "?"} photoPath={photoPath} size={72} />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // `capture` is deliberately absent: on a phone this offers the
        // camera AND the gallery, which is what somebody who already has
        // a good photo of themselves wants.
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void choose(file);
        }}
      />

      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Saving…" : photoPath ? "Change" : "Add photo"}
        </Button>
        {photoPath && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              setBusy(true);
              try {
                const result = await removeMyPhoto();
                if (result?.error) setError(result.error);
                else router.refresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove
          </Button>
        )}
      </div>

      <FormMessage error={error} size="xs" />
    </div>
  );
}
