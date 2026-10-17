import "server-only";

import { getMarathonHome } from "@/lib/marathon/queries";
import { createClient } from "@/lib/supabase/server";

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
    supabase.from("indents").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase
      .from("indent_lines")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", since),
  ]);

  return {
    raisedThisMonth: raised.count ?? 0,
    lineCount: lines.count ?? 0,
    awaitingApproval: submitted.count ?? 0,
    approved: approved.count ?? 0,
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
    issuedThisMonth: issued.count ?? 0,
    draftCount: drafts.count ?? 0,
    awaitingDeletion: deletions.count ?? 0,
  };
}

export async function countReceiptsPipeline(): Promise<{
  receivedThisMonth: number;
  awaitingDelivery: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString().slice(0, 10);

  const [received, outstanding] = await Promise.all([
    supabase
      .from("goods_receipts")
      .select("id", { count: "exact", head: true })
      .gte("received_at", since),
    supabase.from("po_facts").select("id", { count: "exact", head: true }).eq("status", "issued"),
  ]);

  return {
    receivedThisMonth: received.count ?? 0,
    awaitingDelivery: outstanding.count ?? 0,
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
    bookedThisMonth: booked.count ?? 0,
    awaitingApproval: awaiting.count ?? 0,
    paidThisMonth: paid.count ?? 0,
    unpaidCount: unpaid.count ?? 0,
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

  return { people: people.count ?? 0, departments: departments.count ?? 0 };
}

/**
 * The only window into Marathon (the service-role client stays in lib/marathon).
 * Returns null, not a throw, so a missing env key cannot take down the home page.
 */
export async function getMarathonPulse() {
  try {
    const { eventName, totalEntries, groupCount, runCounts } = await getMarathonHome();
    return { eventName, totalEntries, groupCount, runCounts };
  } catch (error) {
    console.error("getMarathonPulse failed — hiding the live card:", error);
    return null;
  }
}
