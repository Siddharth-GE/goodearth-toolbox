/** The response every generated-on-demand PDF route sends. Never cached: the sheet is built from live figures. */

/** One piece of a file name: runs of anything outside letters, digits, _ and - become one dash, none left at the ends. */
export function safeFileNamePart(value: string): string {
  return value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
}

/** A Uint8Array copy, never the raw Buffer (BUGCATCHER #1). `disposition` has no default: each route states inline (print) or attachment (download). */
export function pdfResponse(
  bytes: Uint8Array,
  filename: string,
  { disposition }: { disposition: "inline" | "attachment" },
): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
