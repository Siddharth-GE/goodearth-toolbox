/**
 * Shrinks a phone photo of a document in the browser: phone photos are 3–8 MB and the server-action body cap is 4 MB (next.config.ts).
 * Keeps the whole page (`contain`, never cropped) on white, 1,600 px long edge. A PDF goes up as it is. Browser-only (canvas).
 */

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
