import "server-only";

import { getMarathonHome } from "@/lib/marathon/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * The read layer of the platform home (app/(dashboard)/page.tsx) — not
 * a tool. Its whole job is the cross-tool glance, so it is the one
 * module allowed to import other tools' queries (reads only — never
 * their actions, never their components). Tools never import overview,
 * and still never import each other.
 *
 * Everything here is deliberately ungated: the Overview is the shell's
 * home and every signed-in user sees it, whether or not they hold any
 * tool grant — a gate would redirect a designer off their own
 * dashboard. Safe because nothing here returns money: the reads are
 * open-by-design tables and the money-free facts views (bill_facts,
 * po_facts). COUNTS ONLY, never a rupee figure.
 */

/** Counts for the Overview pipeline's first stage. Indents carry no
 * money by design. */
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

  // Exact database counts, head-only — never rows.length (the rule the
  // codebase has now learned four separate times).
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

/** Counts for the Overview pipeline's second stage — the po_facts view
 * (migration 0022) carries no money columns. */
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

  // Exact database counts, head-only — never rows.length.
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

/** Counts for the Overview pipeline's third stage — Inventory carries
 * no money at all. */
export async function countReceiptsPipeline(): Promise<{
  receivedThisMonth: number;
  awaitingDelivery: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString().slice(0, 10);

  // Exact database counts, head-only — never rows.length.
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

/** Counts for the Overview pipeline's last two stages — the bill_facts
 * view (migration 0025) carries no money columns; bill money is
 * /bills-gated. */
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

  // Exact database counts, head-only — never rows.length.
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
 * The four fields the home page's live card shows — the dashboard's
 * only window into Marathon. The service-role client stays confined to
 * lib/marathon; this adapter just narrows what leaves it.
 *
 * Returns null rather than throwing, and the card renders nothing.
 * Marathon is the one tool on this page reached through the service-role
 * client, so it is the one read that can throw outright — createAdminClient
 * does, the moment SUPABASE_SERVICE_ROLE_KEY is missing. The card sits
 * inside <Suspense>, which handles pending and catches nothing, so that
 * throw took down the signed-in home page of every member of staff. A
 * kiosk tool's environment variable must not be able to do that: the
 * shell does not depend on a tool.
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
