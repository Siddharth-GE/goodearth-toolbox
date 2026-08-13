import "server-only";

import { requireTool } from "@/lib/auth/access";
import { cleanSearch, pagedList, type PagedResult } from "@/lib/masters/paged";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";

import {
  allocateReceipts,
  combineSummaries,
  summariseDues,
  todayInIndia,
  type DuesSummary,
  type MilestoneDue,
  type MilestoneInput,
  type ReceiptInput,
} from "./dues";
import { invoiceStageOf, type Bottleneck, type ClientStage, type MilestoneStage } from "./stages";

/**
 * Reads for Client Relations.
 *
 * Every export opens with requireTool("/client-relations") — the app grant
 * IS the permission boundary, and the three CRM tables are RLS-gated on it
 * for SELECT as well as writes (0050 §10). Sidebar visibility is cosmetic.
 *
 * Queries may throw; a failed read has no partial answer worth showing.
 * But `error` is checked explicitly everywhere below, because an empty
 * result and a failed read mean opposite things and here the difference
 * between them is a due of zero and a due of forty lakh.
 */

export const CRM_PAGE_SIZE = 50;

const GRANT = "/client-relations";

/** Anything that must be complete needs a unique tiebreaker — see fetchAll. */
function fail(context: string, error: { message: string } | null): void {
  if (error) {
    console.error(`Client Relations read failed (${context}):`, error);
    throw new Error(`Could not load ${context}: ${error.message}`, { cause: error });
  }
}

/** Headline counts for the tool's welcome screen. Counts only — dues,
 * receipts and every other rupee stay behind the doors. */
export async function getWelcomeCounts() {
  await requireTool(GRANT);
  const supabase = await createClient();

  // Exact database counts, head-only — never rows.length. No embeds
  // here on purpose: a bad select string passes every CI gate.
  const [clients, prospects, engaged] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("stage", "client"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("stage", "prospect"),
    supabase.from("client_engagements").select("id", { count: "exact", head: true }),
  ]);

  return {
    clients: clients.count ?? 0,
    prospects: prospects.count ?? 0,
    engaged: engaged.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------

async function nameMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  fail("staff names", error);
  return new Map((data ?? []).map((row) => [row.id, row.full_name ?? "—"]));
}

export type FilterOptions = {
  projects: { id: string; name: string }[];
  owners: { id: string; name: string }[];
};

/** Projects and the staff who can own a plot — the two dropdowns. */
export async function getFilterOptions(): Promise<FilterOptions> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [projectRes, ownerRes] = await Promise.all([
    supabase.from("projects").select("id, name").order("name").order("id"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .order("id"),
  ]);
  fail("projects", projectRes.error);
  fail("staff", ownerRes.error);

  return {
    projects: projectRes.data ?? [],
    owners: (ownerRes.data ?? []).map((row) => ({ id: row.id, name: row.full_name ?? "—" })),
  };
}

// ---------------------------------------------------------------------
// The client list
// ---------------------------------------------------------------------

export type ClientListRow = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  stage: ClientStage;
  isActive: boolean;
  ownerName: string | null;
  /** Every plot this client holds, for the chips on the row. */
  plots: { unitId: string; unitName: string; projectName: string }[];
};

export type ClientFilters = {
  search?: string;
  stage?: string;
  owner?: string;
  page?: number;
};

/**
 * The landing screen: one row per person, prospects and clients together.
 *
 * A stated limit with a real database count, never rows.length.
 */
export async function listClientsPage(
  filters: ClientFilters = {},
): Promise<PagedResult<ClientListRow>> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const search = cleanSearch(filters.search);

  const page = await pagedList<{
    id: string;
    name: string;
    mobile: string | null;
    email: string | null;
    stage: string;
    is_active: boolean;
    crm_owner_id: string | null;
  }>(
    (pageNo) => {
      let query = supabase
        .from("clients")
        .select("id, name, mobile, email, stage, is_active, crm_owner_id", { count: "exact" })
        .order("name")
        .order("id")
        .range((pageNo - 1) * CRM_PAGE_SIZE, pageNo * CRM_PAGE_SIZE - 1);

      if (filters.stage) query = query.eq("stage", filters.stage);
      if (filters.owner) query = query.eq("crm_owner_id", filters.owner);
      if (search) query = query.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`);
      return query;
    },
    filters.page ?? 1,
    CRM_PAGE_SIZE,
  );

  const clientIds = page.rows.map((row) => row.id);
  const [units, owners] = await Promise.all([
    clientIds.length
      ? supabase
          .from("units")
          .select("id, name, client_id, projects(name)")
          .in("client_id", clientIds)
          .order("name")
          .order("id")
      : Promise.resolve({ data: [], error: null }),
    nameMap(
      supabase,
      page.rows.map((row) => row.crm_owner_id ?? ""),
    ),
  ]);
  fail("plots", units.error);

  const plotsByClient = new Map<string, ClientListRow["plots"]>();
  for (const unit of units.data ?? []) {
    if (!unit.client_id) continue;
    const list = plotsByClient.get(unit.client_id) ?? [];
    list.push({
      unitId: unit.id,
      unitName: unit.name,
      projectName: unit.projects?.name ?? "—",
    });
    plotsByClient.set(unit.client_id, list);
  }

  return {
    ...page,
    rows: page.rows.map((row) => ({
      id: row.id,
      name: row.name,
      mobile: row.mobile,
      email: row.email,
      stage: row.stage as ClientStage,
      isActive: row.is_active,
      ownerName: row.crm_owner_id ? (owners.get(row.crm_owner_id) ?? null) : null,
      plots: plotsByClient.get(row.id) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------
// The plot register — the spreadsheet, as rows
// ---------------------------------------------------------------------

/**
 * NOTE THE `!units_plot_id_fkey` ON `plots`, and do not drop it.
 *
 * `units` has TWO foreign keys to `plots` — the plain `units_plot_id_fkey`
 * and the composite `units_plot_same_project` added by 0029 to guarantee a
 * unit's plot belongs to the unit's project. PostgREST cannot choose
 * between them, so a bare `plots(...)` embed returns HTTP 300 PGRST201,
 * "Could not embed because more than one relationship was found", and
 * every screen using this select dies on the error boundary.
 *
 * Nothing local catches this: it is not a type error, `next build` compiles
 * it happily, and the tests are pure logic with no database. It is only
 * visible by running the query against PostgREST.
 */
const ENGAGEMENT_SELECT = `
  id, unit_id, project_id, crm_owner_id,
  sale_deed_status, sale_deed_original_with, sale_deed_ack, sale_deed_signed_on,
  ca_status, ca_original_with, ca_ack, ca_signed_on,
  registration_stage, registration_note, registration_on,
  bottlenecks, design_support, details, check_in_on,
  plot_value, construction_value, updated_at,
  units!inner (
    id, name, code, status, client_id,
    plots!units_plot_id_fkey ( name, code ),
    clients ( id, name ),
    projects ( id, name )
  )
`;

type EngagementRecord = {
  id: string;
  unit_id: string;
  project_id: string;
  crm_owner_id: string | null;
  sale_deed_status: string;
  sale_deed_original_with: string | null;
  sale_deed_ack: string | null;
  sale_deed_signed_on: string | null;
  ca_status: string;
  ca_original_with: string | null;
  ca_ack: string | null;
  ca_signed_on: string | null;
  registration_stage: string;
  registration_note: string | null;
  registration_on: string | null;
  bottlenecks: string[];
  design_support: string | null;
  details: string | null;
  check_in_on: string | null;
  plot_value: number | null;
  construction_value: number | null;
  updated_at: string;
  units: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    client_id: string | null;
    plots: { name: string; code: string | null } | null;
    clients: { id: string; name: string } | null;
    projects: { id: string; name: string } | null;
  };
};

export type EngagementRow = {
  id: string;
  unitId: string;
  unitName: string;
  unitCode: string | null;
  unitStatus: string;
  plotName: string | null;
  projectId: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  ownerName: string | null;
  saleDeedStatus: string;
  saleDeedOriginalWith: string | null;
  saleDeedAck: string | null;
  caStatus: string;
  caOriginalWith: string | null;
  caAck: string | null;
  registrationStage: string;
  bottlenecks: Bottleneck[];
  designSupport: string | null;
  details: string | null;
  checkInOn: string | null;
  invoiceStage: MilestoneStage | null;
  dues: DuesSummary;
};

export type EngagementFilters = {
  project?: string;
  owner?: string;
  bottleneck?: string;
  deed?: string;
  registration?: string;
  search?: string;
  page?: number;
};

function toRow(
  record: EngagementRecord,
  owners: Map<string, string>,
  dues: DuesSummary,
  invoiceStage: MilestoneStage | null,
): EngagementRow {
  return {
    id: record.id,
    unitId: record.unit_id,
    unitName: record.units.name,
    unitCode: record.units.code,
    unitStatus: record.units.status,
    plotName: record.units.plots?.name ?? null,
    projectId: record.project_id,
    projectName: record.units.projects?.name ?? "—",
    clientId: record.units.clients?.id ?? null,
    clientName: record.units.clients?.name ?? null,
    ownerName: record.crm_owner_id ? (owners.get(record.crm_owner_id) ?? null) : null,
    saleDeedStatus: record.sale_deed_status,
    saleDeedOriginalWith: record.sale_deed_original_with,
    saleDeedAck: record.sale_deed_ack,
    caStatus: record.ca_status,
    caOriginalWith: record.ca_original_with,
    caAck: record.ca_ack,
    registrationStage: record.registration_stage,
    bottlenecks: record.bottlenecks as Bottleneck[],
    designSupport: record.design_support,
    details: record.details,
    checkInOn: record.check_in_on,
    invoiceStage,
    dues,
  };
}

/**
 * Search matches a client's name or a plot's name/code, none of which live
 * on client_engagements. PostgREST cannot `or` across an embedded table
 * without turning the join inner and losing the unassigned plots, so the
 * matching ids are resolved first and the list filtered by `in`.
 */
async function unitIdsMatching(
  supabase: Awaited<ReturnType<typeof createClient>>,
  search: string,
): Promise<string[]> {
  const [byUnit, byClient] = await Promise.all([
    supabase.from("units").select("id").or(`name.ilike.%${search}%,code.ilike.%${search}%`),
    supabase.from("clients").select("id").ilike("name", `%${search}%`),
  ]);
  fail("plot search", byUnit.error);
  fail("client search", byClient.error);

  const clientIds = (byClient.data ?? []).map((row) => row.id);
  let byClientUnits: { id: string }[] = [];
  if (clientIds.length) {
    const res = await supabase.from("units").select("id").in("client_id", clientIds);
    fail("plot search", res.error);
    byClientUnits = res.data ?? [];
  }

  return [...new Set([...(byUnit.data ?? []), ...byClientUnits].map((row) => row.id))];
}

export async function listEngagementsPage(
  filters: EngagementFilters = {},
): Promise<PagedResult<EngagementRow>> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const search = cleanSearch(filters.search);

  let searchUnitIds: string[] | null = null;
  if (search) {
    searchUnitIds = await unitIdsMatching(supabase, search);
    // Nothing matched: short-circuit rather than send an empty `in`, which
    // PostgREST reads as "no filter" and would return every plot.
    if (searchUnitIds.length === 0) {
      return { rows: [], total: 0, page: 1, pageSize: CRM_PAGE_SIZE, pageCount: 1 };
    }
  }

  const page = await pagedList<EngagementRecord>(
    (pageNo) => {
      let query = supabase
        .from("client_engagements")
        .select(ENGAGEMENT_SELECT, { count: "exact" })
        .order("name", { referencedTable: "units" })
        .order("id")
        .range((pageNo - 1) * CRM_PAGE_SIZE, pageNo * CRM_PAGE_SIZE - 1);

      if (filters.project) query = query.eq("project_id", filters.project);
      if (filters.owner) query = query.eq("crm_owner_id", filters.owner);
      if (filters.deed) query = query.eq("sale_deed_status", filters.deed);
      if (filters.registration) query = query.eq("registration_stage", filters.registration);
      // Containment, served by the GIN index in 0050 §4.
      if (filters.bottleneck) query = query.contains("bottlenecks", [filters.bottleneck]);
      if (searchUnitIds) query = query.in("unit_id", searchUnitIds);
      return query;
    },
    filters.page ?? 1,
    CRM_PAGE_SIZE,
  );

  const engagementIds = page.rows.map((row) => row.id);
  const [money, owners] = await Promise.all([
    loadMoney(supabase, engagementIds),
    nameMap(
      supabase,
      page.rows.map((row) => row.crm_owner_id ?? ""),
    ),
  ]);

  const today = todayInIndia();
  return {
    ...page,
    rows: page.rows.map((record) => {
      const milestones = money.milestones.get(record.id) ?? [];
      const receipts = money.receipts.get(record.id) ?? [];
      return toRow(
        record,
        owners,
        summariseDues(milestones, receipts, today),
        invoiceStageOf(milestones.map((m) => ({ stage: m.stage, invoicedOn: m.invoicedOn }))),
      );
    }),
  };
}

// ---------------------------------------------------------------------
// Money, loaded whole
// ---------------------------------------------------------------------

/**
 * Milestones and receipts for a set of engagements.
 *
 * fetchAll, not a plain select: nine milestones per engagement means 43
 * plots already carry 387 rows, and a dues total computed from a silently
 * truncated page is a wrong number that looks right. fetchAll throws if a
 * page fails, which is the behaviour money wants.
 */
async function loadMoney(
  supabase: Awaited<ReturnType<typeof createClient>>,
  engagementIds: string[],
): Promise<{
  milestones: Map<string, (MilestoneInput & { engagementId: string })[]>;
  receipts: Map<string, (ReceiptInput & { engagementId: string })[]>;
}> {
  const milestones = new Map<string, (MilestoneInput & { engagementId: string })[]>();
  const receipts = new Map<string, (ReceiptInput & { engagementId: string })[]>();
  if (engagementIds.length === 0) return { milestones, receipts };

  const [milestoneRows, receiptRows] = await Promise.all([
    fetchAll<{
      id: string;
      engagement_id: string;
      stage: string;
      sort_order: number;
      due_amount: number | null;
      due_on: string | null;
      invoice_no: string | null;
      invoiced_on: string | null;
      note: string | null;
    }>((from, to) =>
      supabase
        .from("client_payment_milestones")
        .select(
          "id, engagement_id, stage, sort_order, due_amount, due_on, invoice_no, invoiced_on, note",
        )
        .in("engagement_id", engagementIds)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      engagement_id: string;
      milestone_id: string | null;
      amount: number;
      received_on: string;
      mode: string;
      reference: string | null;
      note: string | null;
    }>((from, to) =>
      supabase
        .from("client_receipts")
        .select("id, engagement_id, milestone_id, amount, received_on, mode, reference, note")
        .in("engagement_id", engagementIds)
        .order("id")
        .range(from, to),
    ),
  ]);

  for (const row of milestoneRows) {
    const list = milestones.get(row.engagement_id) ?? [];
    list.push({
      engagementId: row.engagement_id,
      id: row.id,
      stage: row.stage,
      sortOrder: row.sort_order,
      dueAmount: row.due_amount,
      dueOn: row.due_on,
      invoicedOn: row.invoiced_on,
    });
    milestones.set(row.engagement_id, list);
  }
  for (const row of receiptRows) {
    const list = receipts.get(row.engagement_id) ?? [];
    list.push({
      engagementId: row.engagement_id,
      id: row.id,
      milestoneId: row.milestone_id,
      amount: row.amount,
      receivedOn: row.received_on,
    });
    receipts.set(row.engagement_id, list);
  }
  return { milestones, receipts };
}

// ---------------------------------------------------------------------
// Relay — read directly, never through lib/relay
// ---------------------------------------------------------------------

export type RelayTrail = {
  chainId: string;
  unitId: string;
  title: string | null;
  activityName: string | null;
  holderName: string | null;
  daysInLeg: number | null;
  currentLeg: number | null;
  legCount: number | null;
  isFinished: boolean;
  isStuck: boolean;
  isQueued: boolean;
};

/**
 * What Relay says is happening on these villas.
 *
 * Read straight off `pusher_chain_state`, which is granted to
 * `authenticated` with no app gate of its own (0043). Relay's own
 * lib/relay/queries.ts cannot be reused — every function there opens
 * requireTool("/relay"), and one tool never imports another tool's code.
 *
 * WHAT THIS CANNOT SAY, and the screen must not imply: the view exposes
 * is_finished for a WHOLE TRAIL only. There is no per-activity completion
 * anywhere, and project_stages is per-project rather than per-unit (0039
 * deferred that deliberately). So "3 trails running, 1 cold" is honest;
 * "Foundation complete" would be a lie.
 */
export async function getRelayForUnits(unitIds: string[]): Promise<Map<string, RelayTrail[]>> {
  await requireTool(GRANT);
  const byUnit = new Map<string, RelayTrail[]>();
  if (unitIds.length === 0) return byUnit;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pusher_chain_state")
    .select(
      "chain_id, unit_id, title, activity_name, holder_id, days_in_leg, current_leg, leg_count, is_finished, is_stuck, is_queued",
    )
    .in("unit_id", unitIds);
  fail("Relay trails", error);

  const holders = await nameMap(
    supabase,
    (data ?? []).map((row) => row.holder_id ?? ""),
  );

  for (const row of data ?? []) {
    if (!row.unit_id || !row.chain_id) continue;
    const list = byUnit.get(row.unit_id) ?? [];
    list.push({
      chainId: row.chain_id,
      unitId: row.unit_id,
      title: row.title,
      activityName: row.activity_name,
      holderName: row.holder_id ? (holders.get(row.holder_id) ?? null) : null,
      daysInLeg: row.days_in_leg,
      currentLeg: row.current_leg,
      legCount: row.leg_count,
      isFinished: row.is_finished ?? false,
      isStuck: row.is_stuck ?? false,
      isQueued: row.is_queued ?? false,
    });
    byUnit.set(row.unit_id, list);
  }
  return byUnit;
}

// ---------------------------------------------------------------------
// One plot, in full
// ---------------------------------------------------------------------

export type MilestoneRow = MilestoneDue & {
  invoiceNo: string | null;
  note: string | null;
};

export type ReceiptRow = {
  id: string;
  milestoneId: string | null;
  milestoneStage: string | null;
  amount: number;
  receivedOn: string;
  mode: string;
  reference: string | null;
  note: string | null;
};

export type EngagementDetail = EngagementRow & {
  registrationNote: string | null;
  registrationOn: string | null;
  saleDeedSignedOn: string | null;
  caSignedOn: string | null;
  plotValue: number | null;
  constructionValue: number | null;
  ownerId: string | null;
  milestones: MilestoneRow[];
  receipts: ReceiptRow[];
  trails: RelayTrail[];
  /** Latest issued design revision, the one design fact that is real data. */
  issuedRevision: number | null;
  issuedAt: string | null;
};

async function buildDetail(records: EngagementRecord[]): Promise<EngagementDetail[]> {
  if (records.length === 0) return [];
  const supabase = await createClient();
  const ids = records.map((r) => r.id);
  const unitIds = records.map((r) => r.unit_id);

  const [money, owners, trails, selections] = await Promise.all([
    loadMoney(supabase, ids),
    nameMap(
      supabase,
      records.map((r) => r.crm_owner_id ?? ""),
    ),
    getRelayForUnits(unitIds),
    supabase
      .from("selections")
      .select("unit_id, revision_no, issued_at")
      .in("unit_id", unitIds)
      .eq("status", "issued"),
  ]);
  fail("issued designs", selections.error);

  const issuedByUnit = new Map<string, { revision: number; at: string | null }>();
  for (const row of selections.data ?? []) {
    const current = issuedByUnit.get(row.unit_id);
    if (!current || row.revision_no > current.revision) {
      issuedByUnit.set(row.unit_id, { revision: row.revision_no, at: row.issued_at });
    }
  }

  // The full milestone/receipt rows, re-read from the maps loadMoney built
  // plus the fields the summary does not carry.
  const detailMilestones = await fetchAll<{
    id: string;
    engagement_id: string;
    invoice_no: string | null;
    note: string | null;
  }>((from, to) =>
    supabase
      .from("client_payment_milestones")
      .select("id, engagement_id, invoice_no, note")
      .in("engagement_id", ids)
      .order("id")
      .range(from, to),
  );
  const extraByMilestone = new Map(detailMilestones.map((m) => [m.id, m]));

  const detailReceipts = await fetchAll<{
    id: string;
    engagement_id: string;
    milestone_id: string | null;
    amount: number;
    received_on: string;
    mode: string;
    reference: string | null;
    note: string | null;
  }>((from, to) =>
    supabase
      .from("client_receipts")
      .select("id, engagement_id, milestone_id, amount, received_on, mode, reference, note")
      .in("engagement_id", ids)
      .order("id")
      .range(from, to),
  );

  const today = todayInIndia();

  return records.map((record) => {
    const milestones = money.milestones.get(record.id) ?? [];
    const receipts = money.receipts.get(record.id) ?? [];
    const allocated = allocateReceipts(milestones, receipts, today);
    const stageById = new Map(milestones.map((m) => [m.id, m.stage]));

    const base = toRow(
      record,
      owners,
      summariseDues(milestones, receipts, today),
      invoiceStageOf(milestones.map((m) => ({ stage: m.stage, invoicedOn: m.invoicedOn }))),
    );
    const issued = issuedByUnit.get(record.unit_id);

    return {
      ...base,
      registrationNote: record.registration_note,
      registrationOn: record.registration_on,
      saleDeedSignedOn: record.sale_deed_signed_on,
      caSignedOn: record.ca_signed_on,
      plotValue: record.plot_value,
      constructionValue: record.construction_value,
      ownerId: record.crm_owner_id,
      milestones: allocated.map((row) => ({
        ...row,
        invoiceNo: extraByMilestone.get(row.id)?.invoice_no ?? null,
        note: extraByMilestone.get(row.id)?.note ?? null,
      })),
      receipts: detailReceipts
        .filter((r) => r.engagement_id === record.id)
        .sort((a, b) => b.received_on.localeCompare(a.received_on))
        .map((r) => ({
          id: r.id,
          milestoneId: r.milestone_id,
          milestoneStage: r.milestone_id ? (stageById.get(r.milestone_id) ?? null) : null,
          amount: r.amount,
          receivedOn: r.received_on,
          mode: r.mode,
          reference: r.reference,
          note: r.note,
        })),
      trails: trails.get(record.unit_id) ?? [],
      issuedRevision: issued?.revision ?? null,
      issuedAt: issued?.at ?? null,
    };
  });
}

/** One plot, for the standalone plot page (including unsold ones). */
export async function getEngagement(engagementId: string): Promise<EngagementDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("client_engagements")
    .select(ENGAGEMENT_SELECT)
    .eq("id", engagementId)
    .maybeSingle();
  fail("this plot", error);
  if (!data) return null;

  const [detail] = await buildDetail([data as unknown as EngagementRecord]);
  return detail ?? null;
}

// ---------------------------------------------------------------------
// One client, in full
// ---------------------------------------------------------------------

export type ClientRecord = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  stage: ClientStage;
  isActive: boolean;
  source: string | null;
  firstContactOn: string | null;
  convertedOn: string | null;
  lostReason: string | null;
  ownerId: string | null;
  ownerName: string | null;
};

export type ClientDetail = {
  client: ClientRecord;
  engagements: EngagementDetail[];
  /** Every plot's dues rolled into one, for the header figures. */
  totals: DuesSummary;
};

export async function getClientDetail(clientId: string): Promise<ClientDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select(
      "id, name, mobile, email, notes, stage, is_active, source, first_contact_on, converted_on, lost_reason, crm_owner_id",
    )
    .eq("id", clientId)
    .maybeSingle();
  fail("this client", error);
  if (!client) return null;

  const unitRes = await supabase.from("units").select("id").eq("client_id", clientId);
  fail("this client's plots", unitRes.error);
  const unitIds = (unitRes.data ?? []).map((row) => row.id);

  let engagements: EngagementDetail[] = [];
  if (unitIds.length) {
    const engagementRes = await supabase
      .from("client_engagements")
      .select(ENGAGEMENT_SELECT)
      .in("unit_id", unitIds)
      .order("name", { referencedTable: "units" })
      .order("id");
    fail("this client's plots", engagementRes.error);
    engagements = await buildDetail((engagementRes.data ?? []) as unknown as EngagementRecord[]);
  }

  const owners = await nameMap(supabase, [client.crm_owner_id ?? ""]);

  return {
    client: {
      id: client.id,
      name: client.name,
      mobile: client.mobile,
      email: client.email,
      notes: client.notes,
      stage: client.stage as ClientStage,
      isActive: client.is_active,
      source: client.source,
      firstContactOn: client.first_contact_on,
      convertedOn: client.converted_on,
      lostReason: client.lost_reason,
      ownerId: client.crm_owner_id,
      ownerName: client.crm_owner_id ? (owners.get(client.crm_owner_id) ?? null) : null,
    },
    engagements,
    // Each plot's dues were worked out on its own ledger; only the answers
    // are added up. See combineSummaries for why merging the inputs would
    // let one villa's payment settle another villa's instalment.
    totals: combineSummaries(engagements.map((engagement) => engagement.dues)),
  };
}

// ---------------------------------------------------------------------
// Dues, across everything
// ---------------------------------------------------------------------

export type DueLine = {
  engagementId: string;
  unitName: string;
  projectName: string;
  clientId: string | null;
  clientName: string | null;
  stage: string;
  dueOn: string | null;
  dueAmount: number | null;
  outstanding: number;
  isOverdue: boolean;
  invoicedOn: string | null;
};

export type DuesBoard = {
  lines: DueLine[];
  totals: DuesSummary;
  /** Plots carrying an outstanding balance, for the figure strip. */
  plotsOwing: number;
};

/**
 * Who owes what, oldest first. The one screen the sheet could not produce
 * at all, because "Due date for Plot amount" was a column of text.
 */
export async function listDues(
  filters: { project?: string; overdueOnly?: boolean } = {},
): Promise<DuesBoard> {
  await requireTool(GRANT);
  const supabase = await createClient();

  let query = supabase.from("client_engagements").select(ENGAGEMENT_SELECT);
  if (filters.project) query = query.eq("project_id", filters.project);
  const { data, error } = await query.order("id");
  fail("the dues board", error);

  const records = (data ?? []) as unknown as EngagementRecord[];
  const money = await loadMoney(
    supabase,
    records.map((r) => r.id),
  );
  const today = todayInIndia();

  const lines: DueLine[] = [];
  const summaries: DuesSummary[] = [];
  const owing = new Set<string>();

  for (const record of records) {
    const milestones = money.milestones.get(record.id) ?? [];
    const receipts = money.receipts.get(record.id) ?? [];
    // One ledger per plot, summarised on its own. Never merged.
    summaries.push(summariseDues(milestones, receipts, today));

    for (const row of allocateReceipts(milestones, receipts, today)) {
      if (row.outstanding <= 0) continue;
      if (filters.overdueOnly && !row.isOverdue) continue;
      owing.add(record.id);
      lines.push({
        engagementId: record.id,
        unitName: record.units.name,
        projectName: record.units.projects?.name ?? "—",
        clientId: record.units.clients?.id ?? null,
        clientName: record.units.clients?.name ?? null,
        stage: row.stage,
        dueOn: row.dueOn,
        dueAmount: row.dueAmount,
        outstanding: row.outstanding,
        isOverdue: row.isOverdue,
        invoicedOn: row.invoicedOn,
      });
    }
  }

  // Overdue first, then by due date, then by plot — a line with no due date
  // sorts last rather than pretending to be urgent.
  lines.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (a.dueOn !== b.dueOn) {
      if (!a.dueOn) return 1;
      if (!b.dueOn) return -1;
      return a.dueOn.localeCompare(b.dueOn);
    }
    return a.unitName.localeCompare(b.unitName);
  });

  return {
    lines,
    totals: combineSummaries(summaries),
    plotsOwing: owing.size,
  };
}

// ---------------------------------------------------------------------
// The figure strip — the sheet's hand-typed header, computed
// ---------------------------------------------------------------------

export type Headlines = {
  plots: number;
  sold: number;
  available: number;
  reserved: number;
  saleDeedsSigned: number;
  agreementsSigned: number;
  forRegistration: number;
  overdue: number;
};

export async function getHeadlines(projectId?: string): Promise<Headlines> {
  await requireTool(GRANT);
  const supabase = await createClient();

  let query = supabase
    .from("client_engagements")
    .select("id, sale_deed_status, ca_status, registration_stage, units!inner(status)");
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query.order("id");
  fail("the summary figures", error);

  const rows = (data ?? []) as unknown as {
    id: string;
    sale_deed_status: string;
    ca_status: string;
    registration_stage: string;
    units: { status: string };
  }[];

  const money = await loadMoney(
    supabase,
    rows.map((r) => r.id),
  );
  const today = todayInIndia();
  const overdue = rows.reduce((count, row) => {
    const summary = summariseDues(
      money.milestones.get(row.id) ?? [],
      money.receipts.get(row.id) ?? [],
      today,
    );
    return count + (summary.overdue > 0 ? 1 : 0);
  }, 0);

  return {
    plots: rows.length,
    sold: rows.filter((r) => r.units.status === "sold").length,
    available: rows.filter((r) => r.units.status === "available").length,
    reserved: rows.filter((r) => r.units.status === "reserved").length,
    saleDeedsSigned: rows.filter((r) => r.sale_deed_status === "signed").length,
    agreementsSigned: rows.filter((r) => r.ca_status === "signed").length,
    forRegistration: rows.filter((r) => ["due", "scheduled"].includes(r.registration_stage)).length,
    overdue,
  };
}

// ---------------------------------------------------------------------
// Plots a prospect could be given
// ---------------------------------------------------------------------

export type AssignableUnit = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  projectId: string;
  projectName: string;
};

/** Unsold plots, for the Assign a plot dialog. */
export async function listAssignableUnits(): Promise<AssignableUnit[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("units")
    .select("id, name, code, status, project_id, projects(name)")
    .is("client_id", null)
    .order("name")
    .order("id");
  fail("available plots", error);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    status: row.status,
    projectId: row.project_id,
    projectName: row.projects?.name ?? "—",
  }));
}
