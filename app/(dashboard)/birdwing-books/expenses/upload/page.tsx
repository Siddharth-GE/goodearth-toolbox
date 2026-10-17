import { UploadExpenses } from "./upload-expenses";

/** Bringing the expenses sheet in. Nothing is written until the preview is read: each line is new, already in the books (skipped, never overwritten), or has a problem. */
export default function UploadPage() {
  return <UploadExpenses />;
}
