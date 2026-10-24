import { turingCaller } from "@/lib/turing/caller";
import { storeDroppedFile } from "@/lib/turing/files";

/** One dropped file at a time, so each stays under the 4.5 MB request limit. */
export async function POST(request: Request) {
  const caller = await turingCaller();
  if ("refused" in caller) return caller.refused;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "That file did not arrive. Try again." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "That file did not arrive. Try again." }, { status: 400 });
  }

  const stored = await storeDroppedFile(file, caller.user.id);
  if (!stored.ok) return Response.json({ error: stored.error }, { status: 400 });
  return Response.json(stored.file);
}
