import "server-only";

import { cache } from "react";

import { hasApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { getCurrentBillActor } from "@/lib/bills/queries";
import { getActionsBoard } from "@/lib/client-relations/next-steps-queries";
import { getDesignActions } from "@/lib/design-management/board-queries";
import { countIndentLinesWaiting } from "@/lib/estimator/indent-queries";
import { isCurrentUserApprover } from "@/lib/indents/queries";
import { countOpenSiteRequests } from "@/lib/inventory/requests-queries";
import { listIndentsToOrder } from "@/lib/purchase-orders/indent-queries";
import { listMyCourt } from "@/lib/relay/queries";
import { readSiteVillas } from "@/lib/supervisors/board-queries";
import { stageOwner } from "@/lib/supervisors/programme";
import { addDays } from "@/lib/supervisors/schedule";
import { createClient } from "@/lib/supabase/server";

/**
 * "My plate" (plan.md, the team's additions, E): what is waiting on the signed-in person, from every tool they hold.
 * Two kinds of line: a tool's queue, for whoever holds the tool (indents to approve, bills to pass), and what is theirs
 * (stages they own, villas they run, their actions and batons). Each tool's read is gated on its grant first — a tool
 * query redirects without one — and wrapped, so one tool failing shows as a note, never an empty plate or a broken page.
 * Counts and names only, never a rupee.
 */

export type PlateItem = { label: string; detail: string | null; href: string };

export type PlateLine = {
  key: string;
  tool: string;
  /** "Indents waiting for your approval". */
  label: string;
  count: number;
  href: string;
  /** Late, overdue or sent back: shown first, in warning. */
  urgent: boolean;
  /** Up to five, by name, when the line is about things rather than a queue. */
  items: PlateItem[];
};

export type Plate = {
  queues: PlateLine[];
  mine: PlateLine[];
  /** Tools whose lines could not be read this time. */
  failed: string[];
};

const ITEMS_SHOWN = 5;

type Client = Awaited<ReturnType<typeof createClient>>;

async function headCount(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function line(
  key: string,
  tool: string,
  label: string,
  count: number,
  href: string,
  options: { urgent?: boolean; items?: PlateItem[] } = {},
): PlateLine[] {
  if (count <= 0) return [];
  return [
    {
      key,
      tool,
      label,
      count,
      href,
      urgent: options.urgent ?? false,
      items: (options.items ?? []).slice(0, ITEMS_SHOWN),
    },
  ];
}

type User = Awaited<ReturnType<typeof requireUser>>;

/** Each tool's queue lines, for the person holding it. */
const QUEUES: {
  tool: string;
  slug: string;
  read: (user: User, supabase: Client) => Promise<PlateLine[]>;
}[] = [
  {
    tool: "Indents",
    slug: "/indents",
    read: async (_user, supabase) => {
      const { isApprover } = await isCurrentUserApprover();
      if (!isApprover) return [];
      const waiting = await headCount(
        supabase
          .from("indents")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
      );
      return line(
        "indents-approve",
        "Indents",
        "Indents waiting for your approval",
        waiting,
        "/indents/list?status=submitted",
      );
    },
  },
  {
    tool: "Estimator",
    slug: "/estimator",
    read: async () =>
      line(
        "estimator-lines",
        "Estimator",
        "Indent lines outside the estimate, waiting for your answer",
        await countIndentLinesWaiting(),
        "/estimator/site-check",
      ),
  },
  {
    tool: "Purchase Orders",
    slug: "/purchase-orders",
    read: async () => {
      const rows = await listIndentsToOrder();
      return line(
        "po-indents",
        "Purchase Orders",
        "Approved indents with something still to order",
        rows.length,
        "/purchase-orders/from-indent",
      );
    },
  },
  {
    tool: "Inventory",
    slug: "/inventory",
    read: async (_user, supabase) => {
      const [awaiting, requests] = await Promise.all([
        headCount(
          supabase
            .from("po_facts")
            .select("id", { count: "exact", head: true })
            .eq("status", "issued"),
        ),
        countOpenSiteRequests(),
      ]);
      return [
        ...line(
          "inventory-requests",
          "Inventory",
          "Site requests to issue",
          requests,
          "/inventory/requests",
        ),
        ...line(
          "inventory-receive",
          "Inventory",
          "Purchase orders awaiting delivery",
          awaiting,
          "/inventory/receive",
        ),
      ];
    },
  },
  {
    tool: "Bills",
    slug: "/bills",
    read: async (_user, supabase) => {
      const actor = await getCurrentBillActor();
      const approver = actor.isAdmin || actor.isApprover;
      const [recorded, approved, cash, orders] = await Promise.all([
        approver
          ? headCount(
              supabase
                .from("bills")
                .select("id", { count: "exact", head: true })
                .eq("status", "recorded"),
            )
          : 0,
        headCount(
          supabase
            .from("bills")
            .select("id", { count: "exact", head: true })
            .eq("status", "approved"),
        ),
        approver
          ? headCount(
              supabase
                .from("cash_requests")
                .select("id", { count: "exact", head: true })
                .eq("status", "submitted"),
            )
          : 0,
        approver
          ? headCount(
              supabase
                .from("labour_contracts")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending_approval"),
            )
          : 0,
      ]);
      return [
        ...line(
          "bills-approve",
          "Bills",
          "Bills waiting for approval",
          recorded,
          "/bills/list?status=recorded",
        ),
        ...line(
          "bills-cash",
          "Bills",
          "A cash request waiting to be released",
          cash,
          "/bills/cash-requests?status=submitted",
        ),
        ...line(
          "bills-orders",
          "Bills",
          "Work orders waiting for approval",
          orders,
          "/bills/work-orders?status=pending_approval",
        ),
        ...line(
          "bills-pay",
          "Bills",
          "Approved bills still to pay",
          approved,
          "/bills/list?status=approved",
        ),
      ];
    },
  },
  {
    tool: "Masters",
    slug: "/masters",
    read: async (_user, supabase) =>
      line(
        "masters-requests",
        "Masters",
        "Item requests from Selections to accept or merge",
        await headCount(
          supabase
            .from("item_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ),
        "/masters/requests",
      ),
  },
];

/** What is the person's own, by tool. */
const MINE: {
  tool: string;
  slug: string | null;
  read: (user: User, supabase: Client) => Promise<PlateLine[]>;
}[] = [
  {
    tool: "Supervisors",
    slug: "/supervisors",
    read: async (user) => {
      const { today, villas, leads } = await readSiteVillas();
      const weekEnd = addDays(today, 6);
      const late: PlateItem[] = [];
      const soon: PlateItem[] = [];
      const waiting: PlateItem[] = [];
      let toConfirm = 0;
      for (const villa of villas) {
        const runs = villa.card.supervisor?.id === user.id;
        if (runs) toConfirm += villa.card.toConfirm;
        for (const stage of villa.stages) {
          if (stage.status === "done") continue;
          if (!runs && stageOwner(stage, leads, new Map())?.id !== user.id) continue;
          const item = {
            label: `${villa.card.villaName} · ${stage.code} ${stage.name}`,
            detail: null as string | null,
            href: `/supervisors/villas/${villa.card.plotId}?tab=schedule`,
          };
          if (stage.forecast.overdueDays) {
            late.push({ ...item, detail: `${stage.forecast.overdueDays} days late` });
          } else if (stage.status === "waiting") {
            waiting.push({ ...item, detail: "waiting" });
          } else if (
            stage.status === "not_started" &&
            stage.forecast.start &&
            stage.forecast.start <= weekEnd
          ) {
            soon.push({ ...item, detail: `starts ${stage.forecast.start}` });
          }
        }
      }
      return [
        ...line(
          "site-late",
          "Supervisors",
          "Stages of yours running late",
          late.length,
          "/supervisors/plan",
          { urgent: true, items: late },
        ),
        ...line(
          "site-waiting",
          "Supervisors",
          "Stages of yours waiting",
          waiting.length,
          "/supervisors/plan",
          { items: waiting },
        ),
        ...line(
          "site-soon",
          "Supervisors",
          "Stages of yours starting this week",
          soon.length,
          "/supervisors/plan",
          { items: soon },
        ),
        ...line(
          "site-confirm",
          "Supervisors",
          "Deliveries to confirm on your villas",
          toConfirm,
          "/supervisors/villas",
        ),
      ];
    },
  },
  {
    tool: "Design Management",
    slug: "/design-management",
    read: async (user, supabase) => {
      const [board, people] = await Promise.all([
        getDesignActions({ who: user.id }),
        supabase.from("design_step_people").select("step_id").eq("profile_id", user.id),
      ]);
      if (people.error) throw new Error(people.error.message);
      const stepIds = (people.data ?? []).map((row) => row.step_id);
      const steps = stepIds.length
        ? await supabase
            .from("design_steps")
            .select("id, unit_id, design_stage_id, status")
            .in("id", stepIds)
            .in("status", ["working", "with_client", "waiting", "revising"])
        : { data: [], error: null };
      if (steps.error) throw new Error(steps.error.message);
      const unitIds = [...new Set((steps.data ?? []).map((step) => step.unit_id))];
      const stageIds = [...new Set((steps.data ?? []).map((step) => step.design_stage_id))];
      const [units, stages] = await Promise.all([
        unitIds.length
          ? supabase.from("units").select("id, name").in("id", unitIds)
          : Promise.resolve({ data: [], error: null }),
        stageIds.length
          ? supabase.from("design_stages").select("id, name").in("id", stageIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (units.error || stages.error) throw new Error((units.error ?? stages.error)!.message);
      const unitName = new Map((units.data ?? []).map((row) => [row.id, row.name]));
      const stageName = new Map((stages.data ?? []).map((row) => [row.id, row.name]));
      const items = (steps.data ?? []).map((step) => ({
        label: `${unitName.get(step.unit_id) ?? "A villa"} · ${stageName.get(step.design_stage_id) ?? "a stage"}`,
        detail: step.status.replace("_", " "),
        href: `/design-management/villas/${step.unit_id}`,
      }));
      return [
        ...line(
          "design-overdue",
          "Design Management",
          "Design actions of yours overdue",
          board.myLoad.overdue,
          "/design-management/actions",
          { urgent: true },
        ),
        ...line(
          "design-steps",
          "Design Management",
          "Design stages you are on, under way",
          items.length,
          "/design-management/villas?who=mine",
          { items },
        ),
        ...line(
          "design-open",
          "Design Management",
          "Design actions of yours open",
          board.myLoad.open - board.myLoad.overdue,
          "/design-management/actions",
        ),
        ...line(
          "design-confirm",
          "Design Management",
          "Design actions finished, for you to confirm",
          board.myToConfirm,
          "/design-management/actions",
        ),
      ];
    },
  },
  {
    tool: "Client Relations",
    slug: "/client-relations",
    read: async (user) => {
      const board = await getActionsBoard({ who: user.id });
      return [
        ...line(
          "crm-overdue",
          "Client Relations",
          "Client actions of yours overdue",
          board.myLoad.overdue,
          "/client-relations/actions",
          { urgent: true },
        ),
        ...line(
          "crm-open",
          "Client Relations",
          "Client actions of yours open",
          board.myLoad.open - board.myLoad.overdue,
          "/client-relations/actions",
        ),
        ...line(
          "crm-confirm",
          "Client Relations",
          "Client actions finished, for you to confirm",
          board.myToConfirm,
          "/client-relations/actions",
        ),
      ];
    },
  },
  {
    tool: "Relay",
    slug: "/relay",
    read: async (user) => {
      const court = await listMyCourt(user.id);
      const items = court.map((chain) => ({
        label: [chain.unitName, chain.title ?? chain.activityName].filter(Boolean).join(" · "),
        detail: chain.isStuck
          ? `stuck, ${chain.daysInLeg} days`
          : `${chain.daysInLeg} days with you`,
        href: "/relay/court",
      }));
      const stuck = court.filter((chain) => chain.isStuck).length;
      return line("relay-court", "Relay", "Batons in your court", court.length, "/relay/court", {
        urgent: stuck > 0,
        items,
      });
    },
  },
  {
    tool: "Indents",
    slug: "/indents",
    read: async (user, supabase) => {
      const { data, error } = await supabase
        .from("indents")
        .select("id, reference, rejection_note")
        .eq("status", "draft")
        .eq("created_by", user.id)
        .not("rejection_note", "is", null)
        .order("updated_at", { ascending: false })
        .limit(ITEMS_SHOWN + 1);
      if (error) throw new Error(error.message);
      const items = (data ?? []).map((row) => ({
        label: row.reference ?? "An indent",
        detail: row.rejection_note,
        href: `/indents/${row.id}`,
      }));
      return line(
        "indents-sent-back",
        "Indents",
        "Your indents sent back to change",
        items.length,
        "/indents/list?status=draft",
        {
          urgent: true,
          items,
        },
      );
    },
  },
];

/** The signed-in person's plate. Cached per request, so the page and the home card share one read. */
export const getMyPlate = cache(async (): Promise<Plate> => {
  const user = await requireUser();
  const supabase = await createClient();
  const failed: string[] = [];

  const run = async (
    readers: {
      tool: string;
      slug: string | null;
      read: (user: User, supabase: Client) => Promise<PlateLine[]>;
    }[],
  ) => {
    const held = [];
    for (const reader of readers)
      if (!reader.slug || (await hasApp(user, reader.slug))) held.push(reader);
    const results = await Promise.all(
      held.map(async (reader) => {
        try {
          return await reader.read(user, supabase);
        } catch (error) {
          console.error(`My plate: ${reader.tool} failed:`, error);
          failed.push(reader.tool);
          return [];
        }
      }),
    );
    return results.flat().sort((a, b) => Number(b.urgent) - Number(a.urgent));
  };

  const [queues, mine] = await Promise.all([run(QUEUES), run(MINE)]);
  return { queues, mine, failed: [...new Set(failed)] };
});

/** How many things wait on the person: the sidebar's count. */
export function plateCount(plate: Plate): number {
  return [...plate.queues, ...plate.mine].reduce((sum, entry) => sum + entry.count, 0);
}
