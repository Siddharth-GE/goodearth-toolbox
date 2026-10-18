"use server";

// Type-only and never re-exported from a "use server" file (check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import {
  keepFolderList,
  NAME_LIMIT,
  type DesignClient,
} from "@/lib/design-management/action-helpers";
import { GRANT } from "@/lib/design-management/shared";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { parseWorkDriveLink } from "@/lib/design-management/workdrive-link";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const NOTE_LIMIT = 1000;

// Every action opens with requireTool and ends by revalidating the layout.

/**
 * Starts a draft revision for one (villa, set). `revision_no` is max + 1 across every status, or 0: a number is spent once. The draft copies the set's default work links.
 * The partial unique index (one draft per unit+set) is the guard; its 23505 becomes a sentence. `seedFailed` is returned so the caller can report the partial honestly.
 * Not an action: its callers do requireTool and revalidatePath.
 */
async function startDraftRevision(
  supabase: DesignClient,
  userId: string,
  unitId: string,
  setId: string,
): Promise<{ revisionId: string; revisionNo: number; seedFailed: boolean } | { error: string }> {
  const { data: last, error: readError } = await supabase
    .from("drawing_revisions")
    .select("revision_no")
    .eq("unit_id", unitId)
    .eq("drawing_set_id", setId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("startDraftRevision read failed:", readError);
    return { error: "Could not start the revision. Try again." };
  }
  const revisionNo = (last?.revision_no ?? -1) + 1;

  const { data: revision, error } = await supabase
    .from("drawing_revisions")
    .insert({
      unit_id: unitId,
      drawing_set_id: setId,
      revision_no: revisionNo,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "A draft already exists for this set on this villa — it is on another transmittal. Finish or delete that one first.",
      };
    }
    console.error("startDraftRevision insert failed:", error);
    return { error: "Could not start the revision. Try again." };
  }

  const { data: defaults, error: defaultsError } = await supabase
    .from("drawing_set_works")
    .select("work_item_id")
    .eq("drawing_set_id", setId);
  let seedFailed = defaultsError !== null;
  if (defaultsError) {
    console.error("startDraftRevision defaults read failed:", defaultsError);
  } else if (defaults && defaults.length > 0) {
    const { error: seedError } = await supabase.from("drawing_revision_works").insert(
      defaults.map((link) => ({
        drawing_revision_id: revision.id,
        work_item_id: link.work_item_id,
        created_by: userId,
      })),
    );
    if (seedError) {
      console.error("startDraftRevision seed failed:", seedError);
      seedFailed = true;
    }
  }

  return { revisionId: revision.id, revisionNo, seedFailed };
}

/**
 * ROWS FIRST, THEN OBJECTS: a failure leaves an orphaned file nobody sees, never a row pointing at nothing. Paths are read BEFORE the RPC, which deletes drawing_revision_files itself.
 * delete_draft_revision (0091) refuses while the revision sits on a transmittal line, so the caller takes the line off first.
 */
async function discardDraftRevision(
  supabase: DesignClient,
  revisionId: string,
): Promise<{ error?: string }> {
  const { data: files, error: filesError } = await supabase
    .from("drawing_revision_files")
    .select("storage_path")
    .eq("drawing_revision_id", revisionId);
  if (filesError) {
    console.error("discardDraftRevision files read failed:", filesError);
    return { error: "Could not delete this draft. Try again." };
  }

  const { error } = await supabase.rpc("delete_draft_revision", { p_revision_id: revisionId });
  if (error) {
    console.error("discardDraftRevision failed:", error);
    return { error: dbErrorMessage(error, "Could not delete this draft. Try again.") };
  }

  const paths = (files ?? []).map((file) => file.storage_path);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(DRAWINGS_BUCKET).remove(paths);
    if (removeError) console.error("discardDraftRevision storage cleanup failed:", removeError);
  }

  return {};
}

/**
 * Starts a transmittal: one villa, one stage, one drawing set; its next revision goes to site as a WorkDrive link (0124).
 * 0099 refuses a set of another stage and a second set on one transmittal, so the screen only offers what the database takes.
 * Order: revision (and new set), header, line. A failure takes back what this call started, so Start leaves a transmittal or no draft. The number is minted on Issue.
 */
export async function startTransmittal(
  unitId: string,
  stageId: string,
  choice: { setId: string } | { newSetName: string },
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: stage, error: stageError } = await supabase
    .from("design_stages")
    .select("is_active")
    .eq("id", stageId)
    .maybeSingle();
  if (stageError) {
    console.error("startTransmittal stage read failed:", stageError);
    return { error: "Could not start the transmittal. Try again." };
  }
  if (!stage?.is_active) return { error: "Pick a design stage that is still in use." };

  let setId: string;
  if ("newSetName" in choice) {
    const name = choice.newSetName.trim();
    if (!name) return { error: "Give the drawing set a name." };
    if (name.length > NAME_LIMIT) {
      return { error: `Keep the name under ${NAME_LIMIT} characters.` };
    }

    const { data: last, error: lastError } = await supabase
      .from("drawing_sets")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) {
      console.error("drawing_sets next sort_order read failed:", lastError);
      return { error: "Could not add the drawing set. Try again." };
    }

    const { data: set, error: setInsertError } = await supabase
      .from("drawing_sets")
      .insert({
        name,
        design_stage_id: stageId,
        sort_order: (last?.sort_order ?? 0) + 10,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (setInsertError) {
      console.error("startTransmittal set insert failed:", setInsertError);
      return { error: dbErrorMessage(setInsertError, "Could not add the drawing set. Try again.") };
    }
    setId = set.id;
  } else {
    const { data: set, error: setError } = await supabase
      .from("drawing_sets")
      .select("design_stage_id")
      .eq("id", choice.setId)
      .maybeSingle();
    if (setError) {
      console.error("startTransmittal set read failed:", setError);
      return { error: "Could not start the transmittal. Try again." };
    }
    if (!set) return { error: "That drawing set no longer exists." };
    if (set.design_stage_id !== stageId) {
      return { error: "That drawing set belongs to another stage." };
    }
    setId = choice.setId;
  }

  // An open draft is continued, never duplicated (one per villa and set); one already on a transmittal is that transmittal's to finish.
  const { data: openDraft, error: draftError } = await supabase
    .from("drawing_revisions")
    .select("id")
    .eq("unit_id", unitId)
    .eq("drawing_set_id", setId)
    .eq("status", "draft")
    .maybeSingle();
  if (draftError) {
    console.error("startTransmittal draft read failed:", draftError);
    return { error: "Could not start the transmittal. Try again." };
  }

  let revisionId: string;
  let startedHere = false;
  if (openDraft) {
    const { data: onLine, error: lineReadError } = await supabase
      .from("transmittal_lines")
      .select("transmittal_id")
      .eq("drawing_revision_id", openDraft.id)
      .limit(1)
      .maybeSingle();
    if (lineReadError) {
      console.error("startTransmittal line read failed:", lineReadError);
      return { error: "Could not start the transmittal. Try again." };
    }
    if (onLine) {
      return {
        error: "This set already has a draft on another transmittal. Open that one to finish it.",
      };
    }
    revisionId = openDraft.id;
  } else {
    const started = await startDraftRevision(supabase, user.id, unitId, setId);
    if ("error" in started) return started;
    if (started.seedFailed) {
      // Only an old set carries default works; they are ticked on the
      // transmittal either way, so this is logged rather than blocking.
      console.error("startTransmittal: the set's default works did not copy", started.revisionId);
    }
    revisionId = started.revisionId;
    startedHere = true;
  }

  const { data: transmittal, error: insertError } = await supabase
    .from("transmittals")
    .insert({ unit_id: unitId, design_stage_id: stageId, created_by: user.id })
    .select("id")
    .single();
  if (insertError) {
    console.error("startTransmittal insert failed:", insertError);
    if (startedHere) await discardDraftRevision(supabase, revisionId);
    revalidatePath("/design-management", "layout");
    return { error: dbErrorMessage(insertError, "Could not start the transmittal. Try again.") };
  }

  const lineError = await appendTransmittalLine(
    supabase,
    user.id,
    transmittal.id,
    unitId,
    revisionId,
  );
  if (lineError) {
    const { error: undoError } = await supabase.rpc("delete_draft_transmittal", {
      p_transmittal_id: transmittal.id,
    });
    if (undoError) console.error("startTransmittal could not take the header back:", undoError);
    if (startedHere) await discardDraftRevision(supabase, revisionId);
    revalidatePath("/design-management", "layout");
    return { error: lineError };
  }

  revalidatePath("/design-management", "layout");
  redirect(`/design-management/transmittals/${transmittal.id}`);
}

/** `unit_id` comes from the header, never the browser. 0099 allows exactly one line per transmittal. */
async function appendTransmittalLine(
  supabase: DesignClient,
  userId: string,
  transmittalId: string,
  unitId: string,
  revisionId: string,
): Promise<string | undefined> {
  const { error } = await supabase.from("transmittal_lines").insert({
    transmittal_id: transmittalId,
    unit_id: unitId,
    drawing_revision_id: revisionId,
    sort_order: 0,
    created_by: userId,
  });
  if (!error) return undefined;

  if (error.code === "23505") return "This transmittal already carries a drawing set.";
  if (error.code === "23503") {
    return "That drawing belongs to another villa and can't go on this transmittal.";
  }
  console.error("appendTransmittalLine failed:", error);
  return dbErrorMessage(error, "Could not add that drawing set. Try again.");
}

/** Editable only while a draft; the guard trigger refuses it once issued and that is shown. The stage is not editable: it came with the set (0099). */
export async function setDraftTransmittalNote(
  transmittalId: string,
  note: string,
): Promise<ActionState> {
  await requireTool(GRANT);
  const trimmed = note.trim();
  if (trimmed.length > NOTE_LIMIT) {
    return { error: `Keep the note under ${NOTE_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("transmittals")
    .update({ note: trimmed || null })
    .eq("id", transmittalId);
  if (error) {
    console.error("setDraftTransmittalNote failed:", error);
    return { error: dbErrorMessage(error, "Could not save the note. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * issue_transmittal (0091) does it all in one transaction: refuses an empty transmittal, releases every draft revision, supersedes the set's earlier release, mints the number.
 * The number goes in the URL so the page can say "Issued as TR-0001". Its refusals are written for people and passed through, which is why the button stays pressable on an empty draft.
 */
export async function issueTransmittal(transmittalId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  // The folder is read once more so the kept list is what it held when it went to site; a failed read never stops the issue.
  const { data: lines, error: linesError } = await supabase
    .from("transmittal_lines")
    .select("drawing_revision_id")
    .eq("transmittal_id", transmittalId);
  if (linesError) {
    console.error("issueTransmittal lines read failed:", linesError);
    return { error: "Could not issue this transmittal. Try again." };
  }
  const revisionIds = (lines ?? []).map((line) => line.drawing_revision_id);
  if (revisionIds.length > 0) {
    const { data: drafts, error: draftsError } = await supabase
      .from("drawing_revisions")
      .select("id, drawings_url")
      .in("id", revisionIds)
      .eq("status", "draft");
    if (draftsError) {
      console.error("issueTransmittal revisions read failed:", draftsError);
      return { error: "Could not issue this transmittal. Try again." };
    }
    for (const draft of drafts ?? []) {
      const parsed = draft.drawings_url ? parseWorkDriveLink(draft.drawings_url) : null;
      if (!parsed?.ok) continue;
      const read = await keepFolderList(supabase, user.id, draft.id, parsed.linkId);
      if (read.error) console.error("issueTransmittal kept the last list:", read.error);
    }
  }

  const { data: number, error } = await supabase.rpc("issue_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("issueTransmittal failed:", error);
    return { error: dbErrorMessage(error, "Could not issue this transmittal. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  redirect(
    `/design-management/transmittals/${transmittalId}?issued=${encodeURIComponent(number ?? "")}`,
  );
}

/**
 * A draft raised by mistake, gone with its draft drawings. Header and lines go in one transaction (delete_draft_transmittal, 0091), then each draft revision, rows before files.
 * An issued transmittal is refused by the function and the guard: it answers "what did site have on the 22nd".
 */
export async function deleteDraftTransmittal(transmittalId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // Read the villa and the drafts BEFORE the rows go.
  const { data: header, error: headerError } = await supabase
    .from("transmittals")
    .select("unit_id")
    .eq("id", transmittalId)
    .maybeSingle();
  if (headerError) {
    console.error("deleteDraftTransmittal read failed:", headerError);
    return { error: "Could not delete this draft. Try again." };
  }

  // Complete, not capped: a draft missed here is left behind.
  let draftIds: string[];
  try {
    const lines = await fetchAll<{ drawing_revision_id: string }>((from, to) =>
      supabase
        .from("transmittal_lines")
        .select("drawing_revision_id")
        .eq("transmittal_id", transmittalId)
        .order("id")
        .range(from, to),
    );
    const revisionIds = lines.map((line) => line.drawing_revision_id);
    const drafts =
      revisionIds.length > 0
        ? await fetchAll<{ id: string }>((from, to) =>
            supabase
              .from("drawing_revisions")
              .select("id")
              .in("id", revisionIds)
              .eq("status", "draft")
              .order("id")
              .range(from, to),
          )
        : [];
    draftIds = drafts.map((draft) => draft.id);
  } catch (readError) {
    console.error("deleteDraftTransmittal drafts read failed:", readError);
    return { error: "Could not delete this draft. Try again." };
  }

  const { error } = await supabase.rpc("delete_draft_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("deleteDraftTransmittal failed:", error);
    return { error: dbErrorMessage(error, "Could not delete this draft. Try again.") };
  }

  // The transmittal is gone, so a draft that would not delete stays on the villa, where Add drawing offers "Continue draft".
  for (const draftId of draftIds) {
    const discarded = await discardDraftRevision(supabase, draftId);
    if (discarded.error) {
      console.error("deleteDraftTransmittal left a draft behind:", draftId, discarded.error);
    }
  }

  revalidatePath("/design-management", "layout");
  redirect(header ? `/design-management/villas/${header.unit_id}` : "/design-management/villas");
}
