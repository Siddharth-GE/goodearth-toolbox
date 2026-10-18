import type { ActionState } from "@/lib/action-state";

// Under the 4 MB server-action body cap (next.config.ts): Next refuses an oversize request BEFORE
// the action runs and the call throws, so check here and show a sentence, not a stuck
// "Uploading...".
const CLIENT_LIMIT_BYTES = 4 * 1024 * 1024 - 64 * 1024;

const TOO_LARGE = "That file is too large — the limit is 4 MB.";

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
