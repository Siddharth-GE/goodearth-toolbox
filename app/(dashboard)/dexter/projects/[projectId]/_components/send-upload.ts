import type { ActionState } from "@/lib/action-state";

// A little under next.config.ts's 4 MB server-action body cap: the form
// adds a title and multipart framing around the file, and a request
// over the cap is refused by Next BEFORE the action runs — the action's
// own size check never sees it, and the call throws instead of
// returning an error. Checked here so the person reads a sentence, not
// a form stuck on "Uploading…".
const CLIENT_LIMIT_BYTES = 4 * 1024 * 1024 - 64 * 1024;

const TOO_LARGE = "That file is too large — the limit is 4 MB.";

/** Runs an upload action with the size checked first and a throw turned into a sentence. */
export async function sendUpload(
  formData: FormData,
  send: (formData: FormData) => Promise<ActionState>,
): Promise<ActionState> {
  const file = formData.get("file");
  if (file instanceof File && file.size > CLIENT_LIMIT_BYTES) return { error: TOO_LARGE };
  try {
    return await send(formData);
  } catch {
    return { error: "The upload did not go through. Check the file is under 4 MB and try again." };
  }
}
