import "server-only";

import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { todayInIndia } from "@/lib/format";

/** A head count, or a throw: the card catches it and says it could not load, never a zero. */
function counted(result: { count: number | null; error: { message: string } | null }): number {
  if (result.error) readFailed("overview", "the home page counts", result.error);
  return result.count ?? 0;
}

/**
 * The home page's reads: not a tool, and the one module allowed to import other tools' queries (reads only, never actions or components).
 * Ungated on purpose, so a user with no grant still gets a home page. Counts only, never a rupee figure.
 */

export async function countIndentsPipeline(): Promise<{
  raisedThisMonth: number;
  lineCount: number;
  awaitingApproval: number;
  approved: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  // Exact head-only counts, never rows.length.
  const [raised, lines, submitted, approved] = await Promise.all([
    // A cancelled indent (0143) counts nowhere.
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .neq("status", "cancelled"),
    supabase
      .from("indent_lines")
      .select("id, indents!indent_lines_indent_id_fkey!inner(status)", {
        count: "exact",
        head: true,
      })
      .gte("created_at", since)
      .neq("indents.status", "cancelled"),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", since),
  ]);

  return {
    raisedThisMonth: counted(raised),
    lineCount: counted(lines),
    awaitingApproval: counted(submitted),
    approved: counted(approved),
  };
}

export async function countPosPipeline(): Promise<{
  issuedThisMonth: number;
  draftCount: number;
  awaitingDeletion: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  const [issued, drafts, deletions] = await Promise.all([
    supabase
      .from("po_facts")
      .select("id", { count: "exact", head: true })
      .in("status", ["issued", "completed"])
      .gte("issued_at", since),
    supabase.from("po_facts").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("po_facts")
      .select("id", { count: "exact", head: true })
      .eq("status", "deletion_requested"),
  ]);

  return {
    issuedThisMonth: counted(issued),
    draftCount: counted(drafts),
    awaitingDeletion: counted(deletions),
  };
}

export async function countReceiptsPipeline(): Promise<{
  receivedThisMonth: number;
  awaitingDelivery: number;
}> {
  const supabase = await createClient();

  const since = `${todayInIndia().slice(0, 8)}01`;

  const [received, outstanding] = await Promise.all([
    supabase
      .from("goods_receipts")
      .select("id", { count: "exact", head: true })
      .gte("received_at", since),
    supabase.from("po_facts").select("id", { count: "exact", head: true }).eq("status", "issued"),
  ]);

  return {
    receivedThisMonth: counted(received),
    awaitingDelivery: counted(outstanding),
  };
}

export async function countBillsPipeline(): Promise<{
  bookedThisMonth: number;
  awaitingApproval: number;
  paidThisMonth: number;
  unpaidCount: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  const [booked, awaiting, paid, unpaid] = await Promise.all([
    supabase
      .from("bill_facts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase
      .from("bill_facts")
      .select("id", { count: "exact", head: true })
      .eq("status", "recorded"),
    supabase
      .from("bill_facts")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .gte("paid_at", since),
    supabase.from("bill_facts").select("id", { count: "exact", head: true }).neq("status", "paid"),
  ]);

  return {
    bookedThisMonth: counted(booked),
    awaitingApproval: counted(awaiting),
    paidThisMonth: counted(paid),
    unpaidCount: counted(unpaid),
  };
}

/**
 * Not lib/directory/queries.ts: its requireTool redirects to "/", which loops on the home page for anyone without the grant.
 * Reads tables open to any signed-in user (profiles, staff_departments).
 */
export async function countPeople(): Promise<{ people: number; departments: number }> {
  const supabase = await createClient();

  const [people, departments] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("staff_departments")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  return { people: counted(people), departments: counted(departments) };
}
