import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import { getLabourBillingOptions, listUnbilledLabour } from "@/lib/bills/labour-queries";
import { dateParam, idParam } from "@/lib/list-params";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listVendors } from "@/lib/masters/vendors";
import { HardHat } from "lucide-react";
import { SendToBill } from "./_components/send-to-bill";

/**
 * Bills → Labour (plan.md B7): the labour the supervisors logged that is
 * not on a bill yet. The billing team ticks entries and sends them to one
 * bill — daily wages by heads × day rates, piece-work against the
 * contractor's work order.
 */
export default async function LabourToBillPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    vendor?: string;
    villa?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const raw = await searchParams;
  const project = idParam(raw.project);
  const vendor = idParam(raw.vendor);
  const villa = idParam(raw.villa);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);

  const [entries, projects, vendors, plots, gstRates] = await Promise.all([
    listUnbilledLabour({ projectId: project, vendorId: vendor, plotId: villa, from, to }),
    listProjects(),
    listVendors(),
    listPlots(),
    listActiveGstRates(),
  ]);
  const options = await getLabourBillingOptions(entries.map((entry) => entry.contractor_id));
  const filtered = Boolean(project || vendor || villa || from || to);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Labour to bill"
        backHref="/bills"
        backLabel="Bills"
        description="What the supervisors logged that isn't on a bill yet. Tick a contractor's entries for one project and send them to one bill."
      />

      <ListToolbar
        action="/bills/labour"
        values={{ project, vendor, villa, from, to }}
        dates={{ label: "Logged" }}
        filters={[
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: projects.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "villa",
            label: "Villa",
            allLabel: "All villas",
            options: plots
              .filter((plot) => !project || plot.project_id === project)
              .map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "vendor",
            label: "Contractor",
            allLabel: "All contractors",
            options: vendors
              .filter((row) => row.is_contractor)
              .map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={
            filtered ? "No unbilled labour matches these filters" : "Nothing waiting to be billed"
          }
          description={
            filtered
              ? undefined
              : "Every labour entry the supervisors logged is on a bill. New ones appear here as they are logged."
          }
        />
      ) : (
        <SendToBill
          entries={entries}
          options={options}
          gstRates={gstRates.map((rate) => rate.rate)}
        />
      )}
    </div>
  );
}
