import { UploadExpenses } from "./upload-expenses";

/**
 * Bringing the expenses sheet in. Nothing is written until the preview has
 * been read: each line says whether it is new, already in the books (the
 * same sheet and cell — skipped, never overwritten), or has a problem.
 */
export default function UploadPage() {
  return <UploadExpenses />;
}
