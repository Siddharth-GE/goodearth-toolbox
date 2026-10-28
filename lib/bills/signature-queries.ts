import "server-only";

import { requireAdmin, requireTool } from "@/lib/auth/access";
import { profileNames } from "@/lib/masters/names";
import type { SignatureBox } from "@/lib/pdf/document";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { BillDetail } from "./queries";
import { SIGNATURES_BUCKET, signatureBoxes, signatureFormat, type BillSigners } from "./signatures";

type Client = Awaited<ReturnType<typeof createClient>>;

const NO_SIGNERS: BillSigners = { preparedBy: null, checkedBy: null, finalBy: null };

async function readSigners(supabase: Client): Promise<BillSigners | null> {
  const { data, error } = await supabase
    .from("bill_signers")
    .select("prepared_by, checked_by, final_by")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    console.error("readSigners failed:", error);
    return null;
  }
  return {
    preparedBy: data?.prepared_by ?? null,
    checkedBy: data?.checked_by ?? null,
    finalBy: data?.final_by ?? null,
  };
}

/** The boxes an approved bill prints; a draft prints none. A failed read prints a box unsigned rather than failing the PDF. */
export async function getBillSignatureBoxes(bill: BillDetail): Promise<SignatureBox[] | null> {
  if (bill.status === "recorded") return null;
  await requireTool("/bills");
  const supabase = await createClient();

  const boxes = signatureBoxes((await readSigners(supabase)) ?? NO_SIGNERS, bill.approved_by);
  const ids = [...new Set(boxes.map((box) => box.userId).filter((id): id is string => id != null))];
  if (ids.length === 0) return boxes.map((box) => ({ label: box.label }));

  const [names, kept] = await Promise.all([
    profileNames(supabase, ids),
    supabase.from("bill_signatures").select("user_id, path").in("user_id", ids),
  ]);
  if (kept.error) console.error("getBillSignatureBoxes signatures failed:", kept.error);

  const images = new Map<string, NonNullable<SignatureBox["image"]>>();
  await Promise.all(
    (kept.data ?? []).map(async (row) => {
      const { data, error } = await supabase.storage.from(SIGNATURES_BUCKET).download(row.path);
      if (error || !data) {
        console.error(`getBillSignatureBoxes could not read ${row.path}:`, error);
        return;
      }
      images.set(row.user_id, {
        data: Buffer.from(await data.arrayBuffer()),
        format: signatureFormat(row.path),
      });
    }),
  );

  return boxes.map((box) => ({
    label: box.label,
    name: box.userId ? (names.get(box.userId) ?? null) : null,
    image: box.userId ? (images.get(box.userId) ?? null) : null,
  }));
}

export type KeptSignature = { userId: string; name: string; url: string | null };

export type SignatureSettings = {
  signers: BillSigners;
  people: { id: string; name: string }[];
  kept: KeptSignature[];
};

/** ADMIN ONLY: who signs every bill, and whose signature is kept. */
export async function getSignatureSettings(): Promise<SignatureSettings> {
  const user = await requireTool("/bills");
  await requireAdmin(user);
  const supabase = await createClient();

  const [signers, people, kept] = await Promise.all([
    readSigners(supabase),
    fetchAll((from, to) =>
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("id")
        .range(from, to),
    ),
    supabase.from("bill_signatures").select("user_id, path"),
  ]);
  if (!signers) throw new Error("Could not read who signs bills.");
  if (kept.error) throw new Error(`Could not read the signatures: ${kept.error.message}`);

  const rows = kept.data ?? [];
  const { data: urls, error: urlError } = rows.length
    ? await supabase.storage.from(SIGNATURES_BUCKET).createSignedUrls(
        rows.map((row) => row.path),
        600,
      )
    : { data: [], error: null };
  if (urlError) console.error("getSignatureSettings signed urls failed:", urlError);
  const urlOf = new Map((urls ?? []).map((one) => [one.path, one.signedUrl]));
  const names = await profileNames(
    supabase,
    rows.map((row) => row.user_id),
  );

  return {
    signers,
    people: people
      .map((person) => ({ id: person.id, name: person.full_name ?? "Unnamed" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    kept: rows
      .map((row) => ({
        userId: row.user_id,
        name: names.get(row.user_id) ?? "Unnamed",
        url: urlOf.get(row.path) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
