import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { formatDate, formatMoney } from "@/lib/format";
import { projectOfUnit } from "@/lib/saarang-collections/core";
import { getCollections } from "@/lib/saarang-collections/queries";
import { periodRange } from "@/lib/saarang-collections/summary";
import {
  CorrectionForm,
  ExcludedForm,
  ExtraUnitForm,
  RemoveButton,
  RulesForm,
} from "../_components/rule-forms";

const HOW: [string, string][] = [
  [
    "Total sold value",
    "Sold Units report (test units out) plus any unit that only appears in Milestones. Plot uses Unit/Plot Price, Villa uses Cost incl. 18% GST.",
  ],
  [
    "Total collection",
    "Every receipt’s Amount (BCY) in the Payments Received export, including TDS and Long Term Liability, less the excluded receipts.",
  ],
  ["Last month collection", "The same receipts, dated inside the collection period."],
  [
    "Collection MTD",
    "The same receipts, dated from the 1st of the report month to the report date.",
  ],
  ["Collected but unused", "Sum of Unused Amount (BCY) on those receipts."],
  ["Outstanding", "Balance on every invoice in the Invoice Details export, test units out."],
  ["Total sold", "Number of units counted in Total sold value."],
  ["Invoice value", "Milestones marked Completed, after corrections, plus GST where set."],
  [
    "OL-Collection",
    "All milestones on the schedule, after duplicates and corrections, plus GST where set.",
  ],
  [
    "Entered by hand",
    "Project value, all expense figures, next month collection, total units and invoices to be raised. They stay as entered until someone changes them.",
  ],
];

function Row({
  children,
  note,
  by,
  action,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
  by: string;
  action: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 space-y-0.5 text-sm">
        <div className="[overflow-wrap:anywhere]">{children}</div>
        {note ? <div className="text-muted text-xs">{note}</div> : null}
        <div className="text-muted text-xs">{by}</div>
      </div>
      {action}
    </li>
  );
}

function List({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  if (children.length === 0) return <p className="text-muted text-sm">{empty}</p>;
  return (
    <ul className="divide-border border-border bg-surface divide-y overflow-hidden rounded-xl border">
      {children}
    </ul>
  );
}

const addedBy = (who: string | null, at: string) =>
  `Added${who ? ` by ${who}` : ""} on ${formatDate(at)}`;

export default async function RulesPage() {
  const c = await getCollections();
  const range = periodRange(c.settings.periodFrom, c.settings.periodTo);

  // The sold report takes a hand-added unit only while Zoho does not list it, and marks it with this source.
  const standing = (unit: string) => {
    const sold = c.result[projectOfUnit(unit) || "plot"].detail.E;
    if (!sold) return "Waiting for the Sold Units report";
    return sold.rows.some((row) => row[0] === unit && row[3] === "Added on Rules tab")
      ? "Added to the totals"
      : "Back in Zoho, not added";
  };

  return (
    <div className="space-y-4">
      <Section
        title="Collection period"
        note="“Last month collection” sums receipts dated inside this period. When newer reports are uploaded it resets to the full previous calendar month. Set any dates on the Summary tab."
      >
        <p className="text-sm font-medium tabular-nums">{range || "Not set"}</p>
      </Section>

      <RulesForm rules={c.rules} />

      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Excluded receipts"
          note="Receipts to leave out of Total collection and Collected but unused, for example a refund or a receipt booked to the wrong company. Empty means every receipt in the export counts."
          bodyClassName="space-y-3"
        >
          <List empty="No receipts excluded.">
            {c.excluded.map((e) => (
              <Row
                key={e.id}
                note={e.reason}
                by={addedBy(e.addedBy, e.addedAt)}
                action={<RemoveButton list="excluded" id={e.id} />}
              >
                <span className="font-mono text-[13px]">{e.receipt_no}</span>
              </Row>
            ))}
          </List>
          <ExcludedForm />
        </Section>

        <Section
          title="Milestone corrections"
          note="Amounts added to or taken off a milestone before it is counted. Use a minus sign to reduce. A blank stage means the unit’s first milestone."
          bodyClassName="space-y-3"
        >
          <List empty="No corrections.">
            {c.corrections.map((x) => (
              <Row
                key={x.id}
                note={x.note}
                by={addedBy(x.addedBy, x.addedAt)}
                action={<RemoveButton list="correction" id={x.id} />}
              >
                <span className="font-mono text-[13px]">{x.unit}</span> ·{" "}
                {x.stage || "first milestone"} · <b>{formatMoney(x.delta)}</b>
              </Row>
            ))}
          </List>
          <CorrectionForm />
        </Section>

        <Section
          title="Sold units missing from Zoho"
          note="A sold unit that has dropped out of the CRM reports. It is counted in Sold value, Total sold, Invoice value and OL-Collection only while it is missing from the upload, so fixing it in Zoho never double counts. Milestone amounts are before GST."
          bodyClassName="space-y-3"
          className="md:col-span-2"
        >
          <List empty="None.">
            {c.extraUnits.map((x) => (
              <Row
                key={x.id}
                note={`Completed ${formatMoney(x.completed)} · pending ${formatMoney(x.pending)} · ${standing(x.unit)}${x.note ? ` · ${x.note}` : ""}`}
                by={addedBy(x.addedBy, x.addedAt)}
                action={<RemoveButton list="extra" id={x.id} />}
              >
                <span className="font-mono text-[13px]">{x.unit}</span>
                {x.applicant ? ` · ${x.applicant}` : ""} · <b>{formatMoney(x.sold_value)}</b>
              </Row>
            ))}
          </List>
          <ExtraUnitForm />
        </Section>
      </div>

      <Card className="p-5">
        <h2 className="text-foreground text-[15px] font-semibold tracking-tight">
          How each number is worked out
        </h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(10rem,max-content)_1fr]">
          {HOW.map(([term, text]) => (
            <div key={term} className="contents">
              <dt className="font-medium">{term}</dt>
              <dd className="text-muted mb-2 sm:mb-0">{text}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
