/**
 * Making a phone's photo of a document small enough to upload — in the
 * browser, before it leaves the phone.
 *
 * A phone camera photo is 3–8 MB and the server-action body cap is 4 MB
 * (next.config.ts), so an unshrunk photo never reaches the server and the
 * person sees an error with nothing to act on (the Directory photo's
 * lesson). A document is read, not framed: the whole page is kept
 * (`contain`, never cropped), on white, at most 1,600 px on its long
 * edge — an ID card or a bill stays legible at that size, in ~200–400 KB.
 *
 * A PDF goes up as it is. Browser-only (canvas); the server checks type
 * and size again regardless — an action is a public endpoint.
 */

export const DOCUMENT_UPLOAD_LIMIT = 4 * 1024 * 1024;
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const LONG_EDGE = 1600;
const QUALITY = 0.82;

export async function shrinkDocumentForUpload(
  file: File,
): Promise<{ blob: Blob; name: string; type: string }> {
  if (file.type === "application/pdf") return { blob: file, name: file.name, type: file.type };
  if (!file.type.startsWith("image/")) throw new Error("not a photo or a PDF");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) throw new Error("encode failed");
    const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
    return { blob, name, type: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
