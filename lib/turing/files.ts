import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { toFile } from "@anthropic-ai/sdk";

import { csvRow } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { readWorkbookBytes } from "@/lib/xlsx";

import { anthropicClient } from "./claude";
import { claudeFailure, NO_KEY } from "./errors";
import { fileKind, MAX_FILE_BYTES, NOT_TAKEN } from "./file-kinds";

export type DroppedFile = { id: string; name: string; mediaType: string; sizeBytes: number };

/** A workbook as text Claude reads directly: each sheet, then its rows as CSV. */
function workbookText(bytes: Uint8Array, name: string): string {
  const sheets = readWorkbookBytes(bytes, name);
  return [...sheets]
    .map(([sheet, rows]) => {
      const lines = rows.map((row) => csvRow(Array.from(row.cells, (cell) => cell ?? "")));
      return `Sheet: ${sheet}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

/**
 * Keeps the admin's copy in their own folder of `turing-files`, and hands Claude the file
 * once through the Files API; a spreadsheet goes as text, since Claude reads text and PDFs.
 */
export async function storeDroppedFile(
  file: File,
  ownerId: string,
): Promise<{ ok: true; file: DroppedFile } | { ok: false; error: string }> {
  const kind = fileKind(file.name);
  if (!kind) return { ok: false, error: NOT_TAKEN };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "Files are taken up to 4 MB each." };
  const client = anthropicClient();
  if (!client) return { ok: false, error: NO_KEY };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let forClaude: { bytes: Uint8Array | string; name: string; type: string };
  if (kind.kind === "spreadsheet") {
    try {
      forClaude = {
        bytes: workbookText(bytes, file.name),
        name: `${file.name}.txt`,
        type: "text/plain",
      };
    } catch {
      return { ok: false, error: "That spreadsheet could not be read. Is it an .xlsx?" };
    }
  } else if (kind.kind === "text") {
    forClaude = { bytes, name: file.name, type: "text/plain" };
  } else {
    forClaude = { bytes, name: file.name, type: kind.type };
  }

  const id = crypto.randomUUID();
  const path = `${ownerId}/${id}.${kind.ext}`;
  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("turing-files")
    .upload(path, new Blob([bytes], { type: kind.type }), { contentType: kind.type });
  if (uploadError) {
    console.error("turing: file upload failed:", uploadError);
    return { ok: false, error: "The file could not be saved. Try again." };
  }

  let anthropicId: string;
  try {
    const sent = await client.files.upload({
      file: await toFile(
        typeof forClaude.bytes === "string"
          ? new TextEncoder().encode(forClaude.bytes)
          : forClaude.bytes,
        forClaude.name,
        { type: forClaude.type },
      ),
    });
    anthropicId = sent.id;
  } catch (error) {
    console.error("turing: Files API upload failed:", error);
    await removeStored([path]);
    const api = error as { status?: number; type?: string };
    return { ok: false, error: claudeFailure(api.status, api.type) };
  }

  const { error } = await supabase.from("turing_files").insert({
    id,
    name: file.name,
    media_type: kind.type,
    size_bytes: file.size,
    storage_path: path,
    anthropic_file_id: anthropicId,
  });
  if (error) {
    console.error("turing: file row failed:", error);
    await removeStored([path]);
    await forgetAtAnthropic([anthropicId]);
    return { ok: false, error: "The file could not be saved. Try again." };
  }
  return { ok: true, file: { id, name: file.name, mediaType: kind.type, sizeBytes: file.size } };
}

export async function removeStored(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.storage.from("turing-files").remove(paths);
  if (error) console.error("turing: could not remove stored files", paths, error);
}

/** Best effort: a file left at Anthropic costs nothing and is reached by nobody else. */
export async function forgetAtAnthropic(ids: string[]): Promise<void> {
  const client = anthropicClient();
  if (!client) return;
  for (const id of ids) {
    try {
      await client.files.delete(id);
    } catch (error) {
      console.error("turing: Files API delete failed", id, error);
    }
  }
}

/** How a sent file appears in the message to Claude. */
export function fileBlock(file: {
  name: string;
  media_type: string;
  anthropic_file_id: string;
}): Anthropic.Beta.Messages.BetaContentBlockParam {
  if (file.media_type.startsWith("image/")) {
    return { type: "image", source: { type: "file", file_id: file.anthropic_file_id } };
  }
  return {
    type: "document",
    title: file.name,
    source: { type: "file", file_id: file.anthropic_file_id },
  };
}
