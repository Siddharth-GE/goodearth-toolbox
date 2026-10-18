/** An inline Content-Disposition for a stored file: an ASCII fallback plus the real name for browsers that read filename*. */
export function inlineDisposition(fileName: string): string {
  const asciiName = fileName.replace(/[^ -~]/g, "_").replace(/"/g, "");
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
